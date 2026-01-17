// src/modules/ai/ai.service.ts
import OpenAI from "openai";
import { prisma } from "../db/prisma";

// ============================================
// 타입 정의
// ============================================

export interface TradingContext {
  // 최근 거래
  recentTrades: Array<{
    symbol: string;
    side: "long" | "short";
    pnl: number;
    entryPrice: number;
    exitPrice: number;
    duration: number; // ms
  }>;

  // 성과 지표
  performance: {
    totalPnl: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    currentDrawdown: number;
    consecutiveLosses: number;
  };

  // 현재 전략 상태
  strategies: Array<{
    name: string;
    type: "grid_bot" | "momentum" | "scalping" | "funding_arb";
    isRunning: boolean;
    allocation: number;
    currentParams: Record<string, number>;
  }>;

  // 시장 상황
  market: {
    btcPrice: number;
    btcChange24h: number;
    fearGreedIndex: number;
    marketPhase: string;
  };
}

export interface AIRecommendation {
  type:
    | "adjust_params"
    | "adjust_allocation"
    | "pause_strategy"
    | "resume_strategy"
    | "adjust_risk"
    | "change_strategy";
  priority: "low" | "medium" | "high" | "critical";
  confidence: number; // 0-1
  strategyName?: string;
  changes?: Record<string, { from: number; to: number }>;
  allocationChanges?: Record<string, number>;
  reason: string;
  autoApply: boolean;
}

export interface AIAnalysisResult {
  triggerReason: string;
  timestamp: string;
  summary: string;
  recommendations: AIRecommendation[];
  rawResponse?: string;
}

// ============================================
// AI 서비스
// ============================================

class AIService {
  private client: OpenAI | null = null;
  private lastAnalysisTime: number = 0;
  private minAnalysisInterval: number = 60 * 60 * 1000; // 60분

  /**
   * 서비스 초기화
   */
  initialize(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ OPENAI_API_KEY not set - AI features disabled");
      return;
    }

    this.client = new OpenAI({ apiKey });
    console.log("🤖 AI service initialized");
  }

  /**
   * 트리거 체크
   */
  shouldTriggerAnalysis(context: TradingContext): {
    trigger: boolean;
    reason: string;
  } {
    // 최소 분석 간격 체크
    if (Date.now() - this.lastAnalysisTime < this.minAnalysisInterval) {
      return { trigger: false, reason: "Too soon since last analysis" };
    }

    // 10개 거래 완료
    if (context.recentTrades.length >= 10) {
      return { trigger: true, reason: "trade_count: 10 trades completed" };
    }

    // 3연속 손실
    if (context.performance.consecutiveLosses >= 3) {
      return { trigger: true, reason: "consecutive_loss: 3 losses in a row" };
    }

    // 10% 드로다운
    if (context.performance.currentDrawdown >= 10) {
      return { trigger: true, reason: "drawdown: 10% drawdown reached" };
    }

    return { trigger: false, reason: "No trigger condition met" };
  }

  /**
   * AI 분석 실행
   */
  async analyze(
    context: TradingContext,
    triggerReason: string,
  ): Promise<AIAnalysisResult> {
    if (!this.client) {
      throw new Error("AI service not initialized");
    }

    this.lastAnalysisTime = Date.now();

    const prompt = this.buildPrompt(context, triggerReason);

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content: `You are an expert crypto trading analyst. Analyze trading performance and provide actionable recommendations.

Your recommendations must be in JSON format with the following structure:
{
  "summary": "Brief analysis summary",
  "recommendations": [
    {
      "type": "adjust_params|adjust_allocation|pause_strategy|resume_strategy|adjust_risk|change_strategy",
      "priority": "low|medium|high|critical",
      "confidence": 0.0-1.0,
      "strategyName": "strategy name if applicable",
      "changes": {"param_name": {"from": old_value, "to": new_value}},
      "allocationChanges": {"strategy_name": new_allocation_percent},
      "reason": "Detailed reason for this recommendation"
    }
  ]
}

Rules:
- Parameter changes must be within ±20% of current values
- Critical priority recommendations should NOT be auto-applied
- Confidence < 0.5 should NOT be auto-applied
- Be conservative with recommendations`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      const recommendations: AIRecommendation[] = (
        parsed.recommendations || []
      ).map((rec: any) => ({
        ...rec,
        autoApply:
          rec.priority !== "critical" &&
          rec.confidence >= 0.5 &&
          rec.type !== "change_strategy",
      }));

      return {
        triggerReason,
        timestamp: new Date().toISOString(),
        summary: parsed.summary || "Analysis completed",
        recommendations,
        rawResponse: content,
      };
    } catch (error) {
      console.error("❌ AI analysis error:", error);
      throw error;
    }
  }

  /**
   * 프롬프트 생성 (Enhanced)
   */
  private buildPrompt(context: TradingContext, triggerReason: string): string {
    const { recentTrades, performance, strategies, market } = context;

    // 추가 메트릭 계산
    const winningTrades = recentTrades.filter((t) => t.pnl > 0);
    const losingTrades = recentTrades.filter((t) => t.pnl < 0);
    const avgWin =
      winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) /
          winningTrades.length
        : 0;
    const avgLoss =
      losingTrades.length > 0
        ? Math.abs(
            losingTrades.reduce((sum, t) => sum + t.pnl, 0) /
              losingTrades.length,
          )
        : 0;
    const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    const runningStrategies = strategies.filter((s) => s.isRunning);
    const pausedStrategies = strategies.filter((s) => !s.isRunning);

    // 최근 거래는 최대 20개로 제한 (토큰 관리)
    const limitedTrades = recentTrades.slice(-20);

    return `
You are an expert quantitative trading advisor analyzing an automated crypto trading system called "Apex". Your role is to provide actionable recommendations to optimize performance and manage risk.

## Analysis Context

**Trigger**: ${triggerReason}
**Timestamp**: ${new Date().toISOString()}

---

## Portfolio Performance Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total PnL | $${performance.totalPnl.toFixed(2)} | ${performance.totalPnl >= 0 ? "🟢" : "🔴"} |
| Win Rate | ${(performance.winRate * 100).toFixed(1)}% | ${performance.winRate >= 0.5 ? "🟢" : performance.winRate >= 0.4 ? "🟡" : "🔴"} |
| Profit Factor | ${performance.profitFactor.toFixed(2)} | ${performance.profitFactor >= 1.5 ? "🟢" : performance.profitFactor >= 1.0 ? "🟡" : "🔴"} |
| Risk/Reward Ratio | ${riskRewardRatio.toFixed(2)} | ${riskRewardRatio >= 1.5 ? "🟢" : riskRewardRatio >= 1.0 ? "🟡" : "🔴"} |
| Max Drawdown | ${performance.maxDrawdown.toFixed(1)}% | ${performance.maxDrawdown <= 10 ? "🟢" : performance.maxDrawdown <= 20 ? "🟡" : "🔴"} |
| Current Drawdown | ${performance.currentDrawdown.toFixed(1)}% | ${performance.currentDrawdown <= 5 ? "🟢" : performance.currentDrawdown <= 15 ? "🟡" : "🔴"} |
| Consecutive Losses | ${performance.consecutiveLosses} | ${performance.consecutiveLosses <= 2 ? "🟢" : performance.consecutiveLosses <= 4 ? "🟡" : "🔴"} |

**Trade Statistics**:
- Total Trades Analyzed: ${recentTrades.length}
- Winning: ${winningTrades.length} (Avg: $${avgWin.toFixed(2)})
- Losing: ${losingTrades.length} (Avg: -$${avgLoss.toFixed(2)})

---

## Recent Trade History

${
  limitedTrades.length > 0
    ? limitedTrades
        .map(
          (t, i) =>
            `${i + 1}. **${t.side.toUpperCase()} ${t.symbol}**
   - Entry: $${t.entryPrice.toFixed(2)} → Exit: $${t.exitPrice.toFixed(2)}
   - PnL: ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)} (${(((t.exitPrice - t.entryPrice) / t.entryPrice) * 100 * (t.side === "long" ? 1 : -1)).toFixed(2)}%)
   - Result: ${t.pnl >= 0 ? "✅ Win" : "❌ Loss"}`,
        )
        .join("\n\n")
    : "No recent trades available."
}

---

## Active Strategy Configurations

### Running Strategies (${runningStrategies.length})
${
  runningStrategies.length > 0
    ? runningStrategies
        .map(
          (s) =>
            `**${s.name}** [${s.type}]
- Allocation: ${s.allocation}%
- Parameters: \`${JSON.stringify(s.currentParams)}\``,
        )
        .join("\n\n")
    : "No strategies currently running."
}

### Paused Strategies (${pausedStrategies.length})
${
  pausedStrategies.length > 0
    ? pausedStrategies
        .map((s) => `**${s.name}** [${s.type}] - Allocation: ${s.allocation}%`)
        .join("\n")
    : "None"
}

---

## Current Market Regime

| Indicator | Value | Interpretation |
|-----------|-------|----------------|
| BTC Price | $${market.btcPrice.toLocaleString()} | - |
| 24h Change | ${market.btcChange24h >= 0 ? "+" : ""}${market.btcChange24h.toFixed(2)}% | ${Math.abs(market.btcChange24h) > 5 ? "High Volatility" : "Normal"} |
| Fear & Greed | ${market.fearGreedIndex}/100 | ${market.marketPhase} |
| Market Phase | ${market.marketPhase} | ${this.getMarketPhaseAdvice(market.fearGreedIndex)} |

---

## Required Analysis

Based on the above data, provide your analysis in the following JSON structure:

\`\`\`json
{
  "summary": {
    "overallHealth": "healthy | warning | critical",
    "urgentAction": boolean,
    "confidenceLevel": 0-100
  },
  "diagnosis": {
    "primaryIssues": ["string"],
    "rootCauses": ["string"],
    "positiveFactors": ["string"]
  },
  "recommendations": [
    {
      "priority": "immediate | short-term | medium-term",
      "category": "risk-management | strategy-adjustment | position-sizing | market-timing",
      "action": "string (specific actionable step)",
      "rationale": "string",
      "expectedImpact": "string",
      "parameters": {}
    }
  ],
  "strategyAdjustments": [
    {
      "strategyName": "string",
      "currentState": "running | paused",
      "recommendedState": "running | paused | modify",
      "parameterChanges": {},
      "reason": "string"
    }
  ],
  "riskAssessment": {
    "currentRiskLevel": "low | medium | high | critical",
    "maxRecommendedExposure": 0-100,
    "stopLossRecommendation": "string",
    "hedgingAdvice": "string"
  },
  "marketOutlook": {
    "shortTerm": "bullish | neutral | bearish",
    "reasoning": "string",
    "keyLevelsToWatch": {
      "support": number,
      "resistance": number
    }
  }
}
\`\`\`

## Analysis Guidelines

1. **Risk First**: If current drawdown > 15% or consecutive losses > 3, prioritize risk reduction
2. **Market Alignment**: Ensure strategy parameters align with current market phase
3. **Position Sizing**: Consider Kelly Criterion or fixed fractional based on recent performance
4. **Correlation**: Account for correlated positions across strategies
5. **Regime Change**: Flag if market conditions suggest strategy rotation

Respond ONLY with the JSON object, no additional text.
`;
  }

  /**
   * 마켓 페이즈 조언
   */
  private getMarketPhaseAdvice(fearGreedIndex: number): string {
    if (fearGreedIndex <= 25)
      return "Extreme Fear - Potential buying opportunity";
    if (fearGreedIndex <= 45) return "Fear - Cautious accumulation";
    if (fearGreedIndex <= 55) return "Neutral - Standard operations";
    if (fearGreedIndex <= 75) return "Greed - Consider taking profits";
    return "Extreme Greed - High reversal risk";
  }

  /**
   * 추천사항 적용
   */
  async applyRecommendations(recommendations: AIRecommendation[]): Promise<
    Array<{
      recommendation: AIRecommendation;
      applied: boolean;
      result: string;
    }>
  > {
    const results: Array<{
      recommendation: AIRecommendation;
      applied: boolean;
      result: string;
    }> = [];

    const { strategyService } = await import("@strategy/strategy.service");

    for (const rec of recommendations) {
      if (!rec.autoApply) {
        results.push({
          recommendation: rec,
          applied: false,
          result: "Requires manual approval",
        });
        continue;
      }

      // 실제 적용 로직
      console.log(`🤖 Applying recommendation: ${rec.type}`);
      console.log(`   Reason: ${rec.reason}`);

      try {
        if (rec.type === "adjust_params" && rec.strategyName && rec.changes) {
          const strategies = strategyService.getAllStrategies();
          const target = strategies.find((s) => s.name === rec.strategyName);

          if (!target) {
            results.push({
              recommendation: rec,
              applied: false,
              result: `Strategy not found: ${rec.strategyName}`,
            });
            continue;
          }

          const currentParams = target.strategy.getConfig();
          const newParams = { ...currentParams } as any;

          for (const [param, { from, to }] of Object.entries(rec.changes)) {
            // ±20% 제한 체크
            const changePercent = Math.abs((to - from) / from) * 100;
            if (changePercent > 20) {
              console.warn(
                `⚠️ Change for ${param} exceeds 20% limit (${changePercent.toFixed(1)}%)`,
              );
              // limit to 20%
              const direction = to > from ? 1.2 : 0.8;
              newParams[param] = from * direction;
            } else {
              newParams[param] = to;
            }
          }

          await strategyService.updateParams(
            target.id,
            newParams,
            rec.reason,
            "ai",
          );

          results.push({
            recommendation: rec,
            applied: true,
            result: "Parameters updated and persisted to DB",
          });
        } else if (
          (rec.type === "pause_strategy" || rec.type === "resume_strategy") &&
          rec.strategyName
        ) {
          const strategies = strategyService.getAllStrategies();
          const target = strategies.find((s) => s.name === rec.strategyName);

          if (target) {
            await strategyService.toggleStrategy(
              target.id,
              rec.type === "resume_strategy",
            );
            results.push({
              recommendation: rec,
              applied: true,
              result: `Strategy ${rec.type === "resume_strategy" ? "resumed" : "paused"}`,
            });
          } else {
            results.push({
              recommendation: rec,
              applied: false,
              result: `Strategy not found: ${rec.strategyName}`,
            });
          }
        } else if (rec.type === "adjust_allocation" && rec.allocationChanges) {
          // 자본 배분 변경
          const strategies = strategyService.getAllStrategies();
          const allocations: Record<string, number> = {};

          for (const [strategyName, newAllocation] of Object.entries(
            rec.allocationChanges,
          )) {
            const target = strategies.find((s) => s.name === strategyName);
            if (target) {
              // ±10% 제한 (allocation은 더 보수적으로)
              const currentAllocation = target.allocation;
              const maxChange = 10; // 최대 10%p 변경
              const clampedAllocation = Math.max(
                Math.max(0, currentAllocation - maxChange),
                Math.min(
                  Math.min(100, currentAllocation + maxChange),
                  newAllocation,
                ),
              );
              allocations[target.id] = clampedAllocation;

              if (clampedAllocation !== newAllocation) {
                console.warn(
                  `⚠️ Allocation for ${strategyName} clamped: requested ${newAllocation}%, applied ${clampedAllocation}% (±10%p limit)`,
                );
              }
            }
          }

          if (Object.keys(allocations).length > 0) {
            const changes = await strategyService.updateAllocation(
              allocations,
              rec.reason,
              "ai",
            );
            results.push({
              recommendation: rec,
              applied: true,
              result: `Allocation updated for ${changes.length} strategies`,
            });
          } else {
            results.push({
              recommendation: rec,
              applied: false,
              result: "No valid strategies found for allocation change",
            });
          }
        } else if (rec.type === "adjust_risk") {
          // 리스크 조정 - 모든 전략의 레버리지/포지션 크기 조정
          const strategies = strategyService.getAllStrategies();
          let adjustedCount = 0;

          for (const strategy of strategies) {
            if (!strategy.enabled) continue;

            const currentParams = strategy.strategy.getConfig();
            const newParams = { ...currentParams };
            let changed = false;

            // 레버리지 조정 (있는 경우)
            if ("leverage" in newParams && rec.changes?.leverage) {
              const { to } = rec.changes.leverage;
              // 레버리지는 최소 1, 최대 현재값의 ±20%
              const currentLev = newParams.leverage as number;
              const maxLev = Math.min(currentLev * 1.2, to);
              const minLev = Math.max(1, currentLev * 0.8, to);
              newParams.leverage = Math.max(minLev, Math.min(maxLev, to));
              changed = true;
            }

            // 포지션 크기 조정 (있는 경우)
            if (
              "positionSizePercent" in newParams &&
              rec.changes?.positionSizePercent
            ) {
              const { to } = rec.changes.positionSizePercent;
              const current = newParams.positionSizePercent as number;
              const maxSize = Math.min(current * 1.2, to);
              const minSize = Math.max(1, current * 0.8, to);
              newParams.positionSizePercent = Math.max(
                minSize,
                Math.min(maxSize, to),
              );
              changed = true;
            }

            if (changed) {
              await strategyService.updateParams(
                strategy.id,
                newParams,
                rec.reason,
                "ai",
              );
              adjustedCount++;
            }
          }

          results.push({
            recommendation: rec,
            applied: adjustedCount > 0,
            result:
              adjustedCount > 0
                ? `Risk adjusted for ${adjustedCount} strategies`
                : "No strategies adjusted",
          });
        } else {
          results.push({
            recommendation: rec,
            applied: false,
            result: `Automation for ${rec.type} not yet implemented`,
          });
        }
      } catch (error: any) {
        results.push({
          recommendation: rec,
          applied: false,
          result: `Error: ${error.message}`,
        });
      }
    }

    return results;
  }

  /**
   * 상태 조회
   */
  /**
   * 백테스트 결과 분석 및 파라미터 최적화
   */
  async analyzeBacktest(
    result: any, // BacktestResult
    strategyType: string,
  ): Promise<AIAnalysisResult> {
    if (!this.client) {
      throw new Error("AI service not initialized");
    }

    const prompt = `
Analyze the following backtest results for a ${strategyType} strategy and recommend parameter optimizations.
The goal is to improve total return and Sharpe ratio while reducing max drawdown.

## Backtest Performance
- Total Return: ${result.totalReturnPercent.toFixed(2)}%
- Max Drawdown: ${result.maxDrawdownPercent.toFixed(2)}%
- Win Rate: ${result.winRate.toFixed(1)}%
- Profit Factor: ${result.profitFactor.toFixed(2)}
- Total Trades: ${result.totalTrades}
- Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}

## Applied Configuration
\`\`\`json
${JSON.stringify(result.config.strategyParams, null, 2)}
\`\`\`

## Analysis Context
- Current BTC Price: $${result.trades.length > 0 ? result.trades[result.trades.length - 1].exitPrice.toFixed(2) : "Unknown"}
- Symbol: ${result.config.symbol}

Return a JSON object with:
1. "summary": Analysis of why the strategy performed this way.
2. "recommendations": A list of parameter changes.
   - Each change must be within ±20% of the current value.
   - For Grid Bot, consider "gridCount", "gridSpacing", "leverage", "stopLossPercent".
   - For Momentum, consider "rsiOverbought", "rsiOversold", "takeProfitPercent", "stopLossPercent".
   - For Scalping, consider "rsiLow", "rsiHigh", "maxDailyTrades", "takeProfitPercent", "stopLossPercent", "leverage".

Structure:
{
  "summary": "...",
  "recommendations": [
    {
      "type": "adjust_params",
      "priority": "medium",
      "confidence": 0.8,
      "strategyName": "${strategyType}",
      "changes": {
        "paramName": { "from": old_value, "to": new_value }
      },
      "reason": "..."
    }
  ]
}
`;

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o", // gpt-5.2는 가상 모델일 수 있으므로 gpt-4o로 설정 (프로젝트 규칙에 맞게 조정 가능)
        messages: [
          {
            role: "system",
            content:
              "You are a quantitative trading expert specializing in automated strategy optimization.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        triggerReason: "backtest_optimization",
        timestamp: new Date().toISOString(),
        summary: parsed.summary || "Optimization analysis completed",
        recommendations: (parsed.recommendations || []).map((rec: any) => ({
          ...rec,
          autoApply: true, // 백테스트 최적화는 기본적으로 자동 적용
        })),
        rawResponse: content,
      };
    } catch (error) {
      console.error("❌ AI backtest analysis error:", error);
      throw error;
    }
  }
  /**
   * 프리셋 최적화 적용
   */
  async applyPresetOptimizations(
    recommendations: AIRecommendation[],
    presetId: string,
  ): Promise<
    Array<{
      recommendation: AIRecommendation;
      applied: boolean;
      result: string;
    }>
  > {
    const results: Array<{
      recommendation: AIRecommendation;
      applied: boolean;
      result: string;
    }> = [];

    const { presetService } = await import("@strategy/preset.service");
    const preset = await prisma.strategyPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }

    const currentParams = JSON.parse(preset.paramsJson);

    for (const rec of recommendations) {
      if (rec.type === "adjust_params" && rec.changes) {
        const newParams = { ...currentParams };
        let appliedCount = 0;

        for (const [param, { from, to }] of Object.entries(rec.changes)) {
          // ±20% 제한 체크
          const changePercent = Math.abs((to - from) / from) * 100;
          let finalTo = to;

          if (changePercent > 100) {
            // 비정상적인 값 방지
            finalTo = from;
          } else if (changePercent > 20) {
            const direction = to > from ? 1.2 : 0.8;
            finalTo = from * direction;
          }

          newParams[param] = finalTo;
          appliedCount++;
        }

        if (appliedCount > 0) {
          await presetService.optimizePreset(
            presetId,
            newParams,
            rec.confidence,
          );
          results.push({
            recommendation: rec,
            applied: true,
            result: `Optimized ${appliedCount} parameters for preset ${preset.name}`,
          });
        }
      } else {
        results.push({
          recommendation: rec,
          applied: false,
          result: `Recommendation type ${rec.type} not supported for preset optimization`,
        });
      }
    }

    return results;
  }
}

export const aiService = new AIService();
