// src/api/routes/ai.ts
import { Elysia, t } from "elysia";
import { aiService, type TradingContext } from "../../modules/ai/ai.service";
import * as CoinGecko from "../../modules/external/coingecko.service";
import * as Sentiment from "../../modules/external/sentiment.service";

// ============================================
// 스키마 정의
// ============================================

const TradingContextSchema = t.Object({
  recentTrades: t.Array(
    t.Object({
      symbol: t.String(),
      side: t.Union([t.Literal("long"), t.Literal("short")]),
      pnl: t.Number(),
      entryPrice: t.Number(),
      exitPrice: t.Number(),
      duration: t.Number(),
    })
  ),
  performance: t.Object({
    totalPnl: t.Number(),
    winRate: t.Number(),
    profitFactor: t.Number(),
    maxDrawdown: t.Number(),
    currentDrawdown: t.Number(),
    consecutiveLosses: t.Number(),
  }),
  strategies: t.Array(
    t.Object({
      name: t.String(),
      type: t.Union([
        t.Literal("grid_bot"),
        t.Literal("momentum"),
        t.Literal("scalping"),
        t.Literal("funding_arb"),
      ]),
      isRunning: t.Boolean(),
      allocation: t.Number(),
      currentParams: t.Record(t.String(), t.Number()),
    })
  ),
  market: t.Optional(
    t.Object({
      btcPrice: t.Number(),
      btcChange24h: t.Number(),
      fearGreedIndex: t.Number(),
      marketPhase: t.String(),
    })
  ),
});

// ============================================
// 라우트
// ============================================

export const aiRoutes = new Elysia({ prefix: "/ai" })
  // 상태 조회
  .get(
    "/status",
    () => {
      return aiService.getStatus();
    },
    {
      detail: {
        tags: ["AI"],
        summary: "AI 서비스 상태",
        description: "AI 서비스 초기화 상태 및 마지막 분석 시간",
      },
    }
  )

  // 트리거 체크
  .post(
    "/check-trigger",
    async ({ body }) => {
      const context = await enrichContext(body);
      const result = aiService.shouldTriggerAnalysis(context);
      return result;
    },
    {
      body: TradingContextSchema,
      detail: {
        tags: ["AI"],
        summary: "트리거 조건 체크",
        description: "AI 분석 트리거 조건 확인 (10개 거래, 3연속 손실, 10% DD)",
      },
    }
  )

  // 분석 실행
  .post(
    "/analyze",
    async ({ body, set }) => {
      if (!aiService.getStatus().initialized) {
        set.status = 503;
        return { error: "AI service not initialized. Set OPENAI_API_KEY." };
      }

      const context = await enrichContext(body.context);
      const triggerReason = body.triggerReason || "manual: API request";

      const result = await aiService.analyze(context, triggerReason);
      return result;
    },
    {
      body: t.Object({
        context: TradingContextSchema,
        triggerReason: t.Optional(t.String()),
      }),
      detail: {
        tags: ["AI"],
        summary: "AI 분석 실행",
        description: "거래 성과 분석 및 추천사항 생성 (OpenAI 사용)",
      },
    }
  )

  // 추천사항 적용
  .post(
    "/apply",
    async ({ body }) => {
      const results = await aiService.applyRecommendations(body.recommendations as any);
      return {
        applied: results.filter((r) => r.applied).length,
        skipped: results.filter((r) => !r.applied).length,
        results,
      };
    },
    {
      body: t.Object({
        recommendations: t.Array(
          t.Object({
            type: t.String(),
            priority: t.String(),
            confidence: t.Number(),
            strategyName: t.Optional(t.String()),
            changes: t.Optional(
              t.Record(
                t.String(),
                t.Object({
                  from: t.Number(),
                  to: t.Number(),
                })
              )
            ),
            allocationChanges: t.Optional(t.Record(t.String(), t.Number())),
            reason: t.String(),
            autoApply: t.Boolean(),
          })
        ),
      }),
      detail: {
        tags: ["AI"],
        summary: "추천사항 적용",
        description: "AI 추천사항을 전략에 적용 (±20% 제한)",
      },
    }
  )

  // 빠른 분석 (컨텍스트 자동 수집)
  .post(
    "/quick-analyze",
    async ({ set }) => {
      if (!aiService.getStatus().initialized) {
        set.status = 503;
        return { error: "AI service not initialized. Set OPENAI_API_KEY." };
      }

      // 시장 데이터 수집
      const [fearGreed, btcPrice] = await Promise.all([
        Sentiment.getFearGreedIndex().catch(() => ({
          value: 50,
          classification: "Neutral",
          marketPhase: "hold",
        })),
        CoinGecko.getPrices(["bitcoin"]).catch(() => ({
          bitcoin: { usd: 95000, usd_24h_change: 0 },
        })),
      ]);

      // 샘플 컨텍스트 (실제로는 DB에서 조회)
      const context: TradingContext = {
        recentTrades: [],
        performance: {
          totalPnl: 0,
          winRate: 0,
          profitFactor: 0,
          maxDrawdown: 0,
          currentDrawdown: 0,
          consecutiveLosses: 0,
        },
        strategies: [
          {
            name: "Grid Bot BTC",
            type: "grid_bot",
            isRunning: true,
            allocation: 40,
            currentParams: {
              upperPrice: 100000,
              lowerPrice: 90000,
              gridCount: 10,
              leverage: 3,
            },
          },
          {
            name: "Momentum ETH",
            type: "momentum",
            isRunning: true,
            allocation: 30,
            currentParams: {
              rsiOversold: 30,
              rsiOverbought: 70,
              stopLossPercent: 2,
              takeProfitPercent: 5,
            },
          },
        ],
        market: {
          btcPrice: btcPrice.bitcoin?.usd || 95000,
          btcChange24h: btcPrice.bitcoin?.usd_24h_change || 0,
          fearGreedIndex: fearGreed.value,
          marketPhase: fearGreed.marketPhase,
        },
      };

      const result = await aiService.analyze(context, "manual: quick-analyze");
      return result;
    },
    {
      detail: {
        tags: ["AI"],
        summary: "빠른 분석",
        description: "시장 데이터 자동 수집 후 AI 분석 실행",
      },
    }
  );

// ============================================
// 헬퍼 함수
// ============================================

async function enrichContext(
  context: Omit<TradingContext, "market"> & {
    market?: TradingContext["market"];
  }
): Promise<TradingContext> {
  // market 데이터가 없으면 자동으로 수집
  if (!context.market) {
    try {
      const [fearGreed, btcPrice] = await Promise.all([
        Sentiment.getFearGreedIndex(),
        CoinGecko.getPrices(["bitcoin"]),
      ]);

      return {
        ...context,
        market: {
          btcPrice: btcPrice.bitcoin?.usd || 95000,
          btcChange24h: btcPrice.bitcoin?.usd_24h_change || 0,
          fearGreedIndex: fearGreed.value,
          marketPhase: fearGreed.marketPhase,
        },
      };
    } catch (error) {
      console.warn("Failed to fetch market data:", error);
      return {
        ...context,
        market: {
          btcPrice: 95000,
          btcChange24h: 0,
          fearGreedIndex: 50,
          marketPhase: "hold",
        },
      };
    }
  }

  return context as TradingContext;
}
