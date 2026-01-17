// src/jobs/ai-orchestration.job.ts

import { aiService, type TradingContext } from "../modules/ai";
import { prisma } from "../modules/db/prisma";
import { telegramService } from "../modules/notification/telegram.service";
import { strategyService } from "../modules/strategy/strategy.service";

// ============================================
// AI Orchestration Job
// ============================================

/**
 * AI 분석 오케스트레이션 실행
 *
 * 트리거 조건:
 * - 10개 거래 완료
 * - 3연속 손실
 * - 10% 드로다운
 * - 정기 분석 (1시간마다)
 */
export async function runAIOrchestration(): Promise<{
  triggered: boolean;
  reason: string;
  applied?: number;
}> {
  console.log("🤖 [AI Orchestration] Starting...");

  try {
    // 1. 트레이딩 컨텍스트 수집
    const context = await gatherTradingContext();

    // 2. 트리거 조건 체크
    const { trigger, reason } = aiService.shouldTriggerAnalysis(context);

    if (!trigger) {
      console.log(`ℹ️ [AI Orchestration] No trigger: ${reason}`);
      return { triggered: false, reason };
    }

    console.log(`🔔 [AI Orchestration] Trigger: ${reason}`);

    // 3. AI 분석 실행
    const analysis = await aiService.analyze(context, reason);

    console.log(`📊 [AI Orchestration] Analysis complete`);
    console.log(`   Summary: ${analysis.summary}`);
    console.log(`   Recommendations: ${analysis.recommendations.length}`);

    // 4. 추천 사항 적용
    const results = await aiService.applyRecommendations(
      analysis.recommendations,
    );

    const appliedCount = results.filter((r) => r.applied).length;
    const pendingCount = results.filter((r) => !r.applied).length;

    console.log(
      `✅ [AI Orchestration] Applied: ${appliedCount}, Pending: ${pendingCount}`,
    );

    // 5. 결과 DB 저장
    await saveAnalysisResult(analysis, results);

    // 6. 알림 전송 (중요 추천이 있는 경우)
    const criticalRecs = analysis.recommendations.filter(
      (r) => r.priority === "critical" || r.priority === "high",
    );

    if (criticalRecs.length > 0) {
      await telegramService.notifyAlert({
        level: "warning",
        title: "🤖 AI Analysis - Action Required",
        message: `${criticalRecs.length} high-priority recommendation(s):\n${criticalRecs
          .map((r) => `• ${r.type}: ${r.reason}`)
          .join("\n")}`,
      });
    }

    return { triggered: true, reason, applied: appliedCount };
  } catch (error) {
    console.error("❌ [AI Orchestration] Error:", error);
    throw error;
  }
}

// ============================================
// 컨텍스트 수집
// ============================================

async function gatherTradingContext(): Promise<TradingContext> {
  // 최근 거래 조회
  const recentTradesRaw = await prisma.trade.findMany({
    where: { status: "closed" },
    orderBy: { exitTime: "desc" },
    take: 50,
  });

  const recentTrades = recentTradesRaw.map((t) => ({
    symbol: t.symbol,
    side: t.side as "long" | "short",
    pnl: t.pnl ?? 0,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice ?? t.entryPrice,
    duration:
      t.exitTime && t.entryTime
        ? new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()
        : 0,
  }));

  // 성과 지표 계산
  const performance = calculatePerformance(recentTrades);

  // 전략 상태 (isAgentic이 true인 전략만 집중 분석 대상)
  const strategies = strategyService.getAllStrategies().map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type as "grid_bot" | "momentum" | "scalping" | "funding_arb",
    isRunning: s.enabled,
    isAgentic: s.isAgentic,
    allocation: s.allocation,
    currentParams: extractNumericParams(s.strategy.getConfig()),
    stats: s.strategy.getStats(), // 개별 전략의 현재 성과 지표 추가
  }));

  // 시장 데이터
  const market = await gatherMarketData();

  return {
    recentTrades,
    performance,
    strategies,
    market,
  };
}

// ============================================
// 성과 지표 계산
// ============================================

function calculatePerformance(trades: Array<{ pnl: number }>) {
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);

  // 연속 손실 계산
  let consecutiveLosses = 0;
  for (const trade of trades) {
    if (trade.pnl <= 0) {
      consecutiveLosses++;
    } else {
      break;
    }
  }

  // 드로다운 계산 (간소화)
  let peak = 0;
  let maxDrawdown = 0;
  let runningTotal = 0;

  for (const trade of [...trades].reverse()) {
    runningTotal += trade.pnl;
    if (runningTotal > peak) {
      peak = runningTotal;
    }
    const drawdown = peak > 0 ? ((peak - runningTotal) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const profitSum = wins.reduce((sum, t) => sum + t.pnl, 0);
  const lossSum = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

  return {
    totalPnl,
    winRate: trades.length > 0 ? wins.length / trades.length : 0,
    profitFactor: lossSum > 0 ? profitSum / lossSum : profitSum > 0 ? 999 : 0,
    maxDrawdown,
    currentDrawdown: maxDrawdown, // 간소화
    consecutiveLosses,
  };
}

// ============================================
// 시장 데이터 수집
// ============================================

async function gatherMarketData() {
  // 최근 센티먼트 조회
  const sentiment = await prisma.sentimentData.findFirst({
    orderBy: { createdAt: "desc" },
  });

  // 최근 BTC 캔들 조회
  const btcCandle = await prisma.candleCache.findFirst({
    where: { symbol: "BTC" },
    orderBy: { openTime: "desc" },
  });

  const btcPrice = btcCandle?.close ?? 95000;
  const btcChange24h = btcCandle
    ? ((btcCandle.close - btcCandle.open) / btcCandle.open) * 100
    : 0;

  return {
    btcPrice,
    btcChange24h,
    fearGreedIndex: sentiment?.fearGreedIndex ?? 50,
    marketPhase: sentiment?.fearGreedClass ?? "Neutral",
  };
}

// ============================================
// 유틸리티
// ============================================

function extractNumericParams(config: any): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "number") {
      result[key] = value;
    }
  }
  return result;
}

async function saveAnalysisResult(
  analysis: any,
  results: Array<{ applied: boolean; result: string }>,
): Promise<void> {
  await prisma.aIAnalysis.create({
    data: {
      triggerType: analysis.triggerReason,
      inputContext: JSON.stringify({}), // 간소화
      analysisText: analysis.summary,
      confidence: analysis.recommendations[0]?.confidence ?? 0.5,
      riskLevel: "medium",
      recommendations: JSON.stringify(analysis.recommendations),
      appliedCount: results.filter((r) => r.applied).length,
      skippedCount: results.filter((r) => !r.applied).length,
    },
  });
}

// ============================================
// 리스크 체크 (드로다운 한도 초과 시 전략 일시 중지)
// ============================================

export async function runRiskCheck(): Promise<{
  paused: string[];
  reason: string;
}> {
  console.log("🛡️ [Risk Check] Running...");

  const MAX_DRAWDOWN_PERCENT = 15;
  const paused: string[] = [];

  const strategies = strategyService.getAllStrategies();

  for (const strategy of strategies) {
    if (!strategy.enabled) continue;

    const stats = strategy.strategy.getStats();

    // 간소화된 드로다운 체크 (실제로는 더 정교해야 함)
    if (stats.pnl && stats.pnl < 0) {
      const allocation = strategy.allocation || 100;
      const estimatedDrawdown = Math.abs(stats.pnl) / (allocation * 10); // 대략적 추정

      if (estimatedDrawdown > MAX_DRAWDOWN_PERCENT) {
        await strategyService.toggleStrategy(strategy.id, false);
        paused.push(strategy.name);

        console.log(
          `🚨 [Risk Check] Paused ${strategy.name}: Drawdown limit exceeded`,
        );

        await telegramService.notifyAlert({
          level: "error",
          title: "🚨 Risk Alert - Strategy Paused",
          message: `${strategy.name} has been paused due to exceeding ${MAX_DRAWDOWN_PERCENT}% drawdown limit.`,
        });
      }
    }
  }

  return {
    paused,
    reason:
      paused.length > 0 ? `Paused ${paused.length} strategies` : "All clear",
  };
}
