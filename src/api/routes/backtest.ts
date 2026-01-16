// src/api/routes/backtest.ts
import { Elysia, t } from "elysia";
import {
  generateSampleCandles,
  runBacktest,
  type BacktestConfig,
  type CandleData,
} from "../../modules/backtest/backtest.service";
import { getInfoClient } from "../../modules/exchange/hyperliquid.client";

// ============================================
// 스키마 정의
// ============================================

const GridBotBacktestSchema = t.Object({
  symbol: t.String({ default: "BTC" }),
  days: t.Number({ minimum: 1, maximum: 365, default: 30 }),
  initialCapital: t.Number({ minimum: 100, default: 1000 }),
  upperPrice: t.Number(),
  lowerPrice: t.Number(),
  gridCount: t.Number({ minimum: 5, maximum: 50, default: 10 }),
  leverage: t.Number({ minimum: 1, maximum: 10, default: 3 }),
  stopLossPercent: t.Number({ minimum: 1, maximum: 20, default: 5 }),
  useRealData: t.Optional(t.Boolean({ default: false })),
});

const MomentumBacktestSchema = t.Object({
  symbol: t.String({ default: "BTC" }),
  days: t.Number({ minimum: 1, maximum: 365, default: 30 }),
  initialCapital: t.Number({ minimum: 100, default: 1000 }),
  leverage: t.Number({ minimum: 1, maximum: 10, default: 3 }),
  stopLossPercent: t.Number({ minimum: 1, maximum: 10, default: 2 }),
  takeProfitPercent: t.Number({ minimum: 2, maximum: 20, default: 5 }),
  trailingStopPercent: t.Number({ minimum: 0.5, maximum: 5, default: 2 }),
  rsiOversold: t.Optional(t.Number({ default: 30 })),
  rsiOverbought: t.Optional(t.Number({ default: 70 })),
  useRealData: t.Optional(t.Boolean({ default: false })),
});

// ============================================
// 히스토리 데이터 로더
// ============================================

async function fetchHistoricalCandles(
  symbol: string,
  days: number
): Promise<CandleData[]> {
  try {
    const client = getInfoClient();
    const endTime = Date.now();
    const startTime = endTime - days * 24 * 60 * 60 * 1000;

    // Hyperliquid에서 1시간봉 조회 (더 긴 기간용)
    const interval = days > 7 ? "1h" : "15m";

    const rawCandles = await client.candleSnapshot({
      coin: symbol,
      interval,
      startTime,
      endTime,
    });

    if (!rawCandles || rawCandles.length === 0) {
      throw new Error("No candle data returned");
    }

    return rawCandles.map((c: any) => ({
      timestamp: c.t,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));
  } catch (error) {
    console.warn("Failed to fetch real data, using simulated:", error);
    throw error;
  }
}

// ============================================
// 라우트
// ============================================

export const backtestRoutes = new Elysia({ prefix: "/backtest" })

  // Grid Bot 백테스트
  .post(
    "/grid-bot",
    async ({ body }) => {
      let candles: CandleData[];

      if (body.useRealData) {
        try {
          candles = await fetchHistoricalCandles(body.symbol, body.days);
        } catch {
          candles = generateSampleCandles(
            body.days,
            (body.upperPrice + body.lowerPrice) / 2
          );
        }
      } else {
        candles = generateSampleCandles(
          body.days,
          (body.upperPrice + body.lowerPrice) / 2
        );
      }

      const config: BacktestConfig = {
        symbol: body.symbol,
        startDate: new Date(Date.now() - body.days * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        initialCapital: body.initialCapital,
        strategyType: "grid_bot",
        strategyParams: {
          symbol: body.symbol,
          upperPrice: body.upperPrice,
          lowerPrice: body.lowerPrice,
          gridCount: body.gridCount,
          totalCapital: body.initialCapital,
          leverage: body.leverage,
          stopLossPercent: body.stopLossPercent,
        },
      };

      const startTime = Date.now();
      const result = runBacktest(config, candles);
      const executionTime = Date.now() - startTime;

      return {
        strategy: "grid_bot",
        dataSource: body.useRealData ? "real" : "simulated",
        candleCount: candles.length,
        executionTimeMs: executionTime,
        config: {
          symbol: body.symbol,
          days: body.days,
          upperPrice: body.upperPrice,
          lowerPrice: body.lowerPrice,
          gridCount: body.gridCount,
          leverage: body.leverage,
        },
        performance: {
          startBalance: result.startBalance,
          endBalance: result.endBalance,
          totalReturn: result.totalReturn,
          totalReturnPercent: result.totalReturnPercent,
          maxDrawdownPercent: result.maxDrawdownPercent,
          sharpeRatio: result.sharpeRatio,
        },
        trades: {
          total: result.totalTrades,
          wins: result.winCount,
          losses: result.lossCount,
          winRate: result.winRate,
          profitFactor: result.profitFactor,
          averageWin: result.averageWin,
          averageLoss: result.averageLoss,
        },
        recentTrades: result.trades.slice(-10),
      };
    },
    {
      body: GridBotBacktestSchema,
      detail: {
        tags: ["Backtest"],
        summary: "Grid Bot 백테스트",
        description: "Grid Bot 전략 백테스트 실행",
      },
    }
  )

  // Momentum 백테스트
  .post(
    "/momentum",
    async ({ body }) => {
      let candles: CandleData[];

      if (body.useRealData) {
        try {
          candles = await fetchHistoricalCandles(body.symbol, body.days);
        } catch {
          candles = generateSampleCandles(body.days, 95000);
        }
      } else {
        candles = generateSampleCandles(body.days, 95000);
      }

      const config: BacktestConfig = {
        symbol: body.symbol,
        startDate: new Date(Date.now() - body.days * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        initialCapital: body.initialCapital,
        strategyType: "momentum",
        strategyParams: {
          symbol: body.symbol,
          rsiOversold: body.rsiOversold || 30,
          rsiOverbought: body.rsiOverbought || 70,
          bbStdDev: 2,
          adxThreshold: 25,
          leverage: body.leverage,
          stopLossPercent: body.stopLossPercent,
          takeProfitPercent: body.takeProfitPercent,
          trailingStopPercent: body.trailingStopPercent,
          totalCapital: body.initialCapital,
        },
      };

      const startTime = Date.now();
      const result = runBacktest(config, candles);
      const executionTime = Date.now() - startTime;

      return {
        strategy: "momentum",
        dataSource: body.useRealData ? "real" : "simulated",
        candleCount: candles.length,
        executionTimeMs: executionTime,
        config: {
          symbol: body.symbol,
          days: body.days,
          leverage: body.leverage,
          stopLossPercent: body.stopLossPercent,
          takeProfitPercent: body.takeProfitPercent,
        },
        performance: {
          startBalance: result.startBalance,
          endBalance: result.endBalance,
          totalReturn: result.totalReturn,
          totalReturnPercent: result.totalReturnPercent,
          maxDrawdownPercent: result.maxDrawdownPercent,
          sharpeRatio: result.sharpeRatio,
        },
        trades: {
          total: result.totalTrades,
          wins: result.winCount,
          losses: result.lossCount,
          winRate: result.winRate,
          profitFactor: result.profitFactor,
          averageWin: result.averageWin,
          averageLoss: result.averageLoss,
        },
        recentTrades: result.trades.slice(-10),
      };
    },
    {
      body: MomentumBacktestSchema,
      detail: {
        tags: ["Backtest"],
        summary: "Momentum 백테스트",
        description: "Momentum 전략 백테스트 실행",
      },
    }
  )

  // 권장 백테스트 설정
  .get(
    "/recommendations",
    () => {
      return {
        description: "전략별 권장 백테스트 기간 및 설정",
        strategies: {
          grid_bot: {
            minDays: 7,
            recommendedDays: 30,
            maxDays: 90,
            reason: "횡보장 전략이므로 다양한 시장 상황을 커버하는 30일 권장",
            tips: [
              "upperPrice, lowerPrice는 현재가 기준 ±5% 권장",
              "gridCount 10-20개가 최적",
              "leverage 3x 이하 권장 (리스크 관리)",
            ],
          },
          momentum: {
            minDays: 14,
            recommendedDays: 60,
            maxDays: 180,
            reason: "추세 전략이므로 상승장/하락장 모두 포함하는 60일 권장",
            tips: [
              "RSI 30/70 기본값 유지 권장",
              "stopLossPercent 2%, takeProfitPercent 5% 권장 (RR 1:2.5)",
              "최소 100개 거래 이상 확보되어야 통계적 유의미",
            ],
          },
        },
        generalTips: [
          "시뮬레이션 데이터는 참고용, 실제 거래는 useRealData=true 권장",
          "Sharpe Ratio > 1.5 목표",
          "Win Rate 보다 Profit Factor > 1.5가 더 중요",
          "Max Drawdown < 15% 목표",
          "최소 50개 이상 거래가 있어야 신뢰도 있음",
        ],
        quickStart: {
          gridBot: {
            endpoint: "POST /backtest/grid-bot",
            example: {
              symbol: "BTC",
              days: 30,
              initialCapital: 1000,
              upperPrice: 100000,
              lowerPrice: 90000,
              gridCount: 10,
              leverage: 3,
              stopLossPercent: 5,
              useRealData: false,
            },
          },
          momentum: {
            endpoint: "POST /backtest/momentum",
            example: {
              symbol: "BTC",
              days: 60,
              initialCapital: 1000,
              leverage: 3,
              stopLossPercent: 2,
              takeProfitPercent: 5,
              trailingStopPercent: 2,
              useRealData: false,
            },
          },
        },
      };
    },
    {
      detail: {
        tags: ["Backtest"],
        summary: "백테스트 권장 설정",
        description: "전략별 권장 백테스트 기간 및 파라미터",
      },
    }
  )

  // 히스토리 데이터 조회
  .get(
    "/candles/:symbol",
    async ({ params, query, set }) => {
      const days = query.days || 7;

      try {
        const candles = await fetchHistoricalCandles(params.symbol, days);
        return {
          symbol: params.symbol,
          days,
          count: candles.length,
          first: candles[0],
          last: candles[candles.length - 1],
          sample: candles.slice(0, 5),
        };
      } catch (error) {
        set.status = 500;
        return { error: "Failed to fetch candles", message: String(error) };
      }
    },
    {
      params: t.Object({ symbol: t.String() }),
      query: t.Object({
        days: t.Optional(t.Number({ default: 7 })),
      }),
      detail: {
        tags: ["Backtest"],
        summary: "히스토리 캔들 조회",
        description: "Hyperliquid에서 히스토리 캔들 데이터 조회",
      },
    }
  );
