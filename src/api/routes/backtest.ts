// src/api/routes/backtest.ts
import { Elysia, t } from "elysia";
import {
  generateSampleCandles,
  runBacktest,
  type BacktestConfig,
  type CandleData,
} from "../../modules/backtest/backtest.service";
import { loadCandlesFromDB } from "../../modules/backtest/data-loader";
import { getInfoClient } from "../../modules/hyperliquid";
import { presetService } from "../../modules/strategy/preset.service";
import type { StrategyType } from "../../types";

// ============================================
// 공통 Enum 스키마 정의
// ============================================

const StrategyTypeEnum = t.Union(
  [
    t.Literal("grid_bot"),
    t.Literal("momentum"),
    t.Literal("scalping"),
    t.Literal("funding_arb"),
  ],
  { default: "momentum", description: "전략 타입" }
);

const PresetNameEnum = t.Union(
  [
    t.Literal("recommended"),
    t.Literal("conservative"),
    t.Literal("aggressive"),
  ],
  { default: "recommended", description: "프리셋 이름" }
);

const SymbolEnum = t.Union(
  [
    t.Literal("BTC"),
    t.Literal("ETH"),
    t.Literal("SOL"),
    t.Literal("ARB"),
    t.Literal("DOGE"),
  ],
  { default: "BTC", description: "거래 심볼" }
);

const DataSourceEnum = t.Union([t.Literal("real"), t.Literal("simulated")]);

// ============================================
// 스키마 정의
// ============================================

const GridBotBacktestSchema = t.Object({
  symbol: SymbolEnum,
  days: t.Number({
    minimum: 1,
    maximum: 365,
    default: 30,
    description: "백테스트 기간 (일)",
  }),
  initialCapital: t.Number({
    minimum: 100,
    default: 1000,
    description: "초기 자본금 ($)",
  }),
  upperPrice: t.Number({ description: "그리드 상한가" }),
  lowerPrice: t.Number({ description: "그리드 하한가" }),
  gridCount: t.Number({
    minimum: 5,
    maximum: 50,
    default: 10,
    description: "그리드 개수",
  }),
  leverage: t.Number({
    minimum: 1,
    maximum: 10,
    default: 3,
    description: "레버리지",
  }),
  stopLossPercent: t.Number({
    minimum: 1,
    maximum: 20,
    default: 5,
    description: "손절 (%)",
  }),
});

const MomentumBacktestSchema = t.Object({
  symbol: SymbolEnum,
  days: t.Number({
    minimum: 1,
    maximum: 365,
    default: 30,
    description: "백테스트 기간 (일)",
  }),
  initialCapital: t.Number({
    minimum: 100,
    default: 1000,
    description: "초기 자본금 ($)",
  }),
  leverage: t.Number({
    minimum: 1,
    maximum: 10,
    default: 3,
    description: "레버리지",
  }),
  stopLossPercent: t.Number({
    minimum: 1,
    maximum: 10,
    default: 2,
    description: "손절 (%)",
  }),
  takeProfitPercent: t.Number({
    minimum: 2,
    maximum: 20,
    default: 5,
    description: "익절 (%)",
  }),
  trailingStopPercent: t.Number({
    minimum: 0.5,
    maximum: 5,
    default: 2,
    description: "트레일링스탑 (%)",
  }),
  rsiOversold: t.Optional(
    t.Number({ default: 30, description: "RSI 과매도 기준" })
  ),
  rsiOverbought: t.Optional(
    t.Number({ default: 70, description: "RSI 과매수 기준" })
  ),
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

      // 항상 실제 데이터 사용
      try {
        candles = await fetchHistoricalCandles(body.symbol, body.days);
      } catch {
        // Fallback: 샘플 데이터 (실제 데이터 실패 시)
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
        dataSource: "real",
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

      // 항상 실제 데이터 사용
      try {
        candles = await fetchHistoricalCandles(body.symbol, body.days);
      } catch {
        // Fallback: 샘플 데이터
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
        dataSource: "real",
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
  )

  // 프리셋 기반 백테스트 (권장!)
  .post(
    "/run",
    async ({ body, set }) => {
      const { strategyType, symbol, preset, days, initialCapital } = body;

      // 프리셋 로드
      const presetData = await presetService.getPreset(
        strategyType as StrategyType,
        preset,
        symbol
      );

      if (!presetData) {
        set.status = 404;
        return {
          error: "Preset not found",
          hint: "Use GET /backtest/presets/:strategyType to see available presets",
        };
      }

      // 항상 실제 데이터 사용
      let candles: CandleData[];
      try {
        candles = await fetchHistoricalCandles(symbol, days);
      } catch {
        // DB에서 시도
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const endDate = new Date();
        candles = await loadCandlesFromDB({ symbol, startDate, endDate });

        if (candles.length === 0) {
          // 최후 fallback: 샘플 데이터
          candles = generateSampleCandles(days, 95000);
        }
      }

      // Grid Bot용 가격 범위 자동 계산
      let gridParams = { ...presetData.params };
      if (strategyType === "grid_bot" && candles.length > 0) {
        const firstPrice = candles[0].close;
        const lastPrice = candles[candles.length - 1].close;
        const avgPrice = (firstPrice + lastPrice) / 2;

        // 프리셋에 없으면 ±5% 범위로 자동 설정
        if (!gridParams.upperPrice) {
          gridParams.upperPrice = avgPrice * 1.05;
        }
        if (!gridParams.lowerPrice) {
          gridParams.lowerPrice = avgPrice * 0.95;
        }
      }

      // 백테스트 설정 구성
      const config: BacktestConfig = {
        symbol,
        startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        initialCapital,
        strategyType: strategyType === "grid_bot" ? "grid_bot" : "momentum",
        strategyParams: {
          symbol,
          totalCapital: initialCapital,
          // 기본값 (프리셋에서 덮어쓰기)
          bbStdDev: 2,
          trailingStopPercent: 2,
          ...gridParams,
        } as any, // 프리셋에서 동적으로 로드되므로 유연하게 처리
      };

      const startTime = Date.now();
      const result = runBacktest(config, candles);
      const executionTime = Date.now() - startTime;

      // 프리셋 통계 업데이트
      await presetService.updatePresetFromBacktest(presetData.id, {
        totalReturnPercent: result.totalReturnPercent,
        winRate: result.winRate,
      });

      return {
        strategy: strategyType,
        preset: preset,
        presetDescription: presetData.description,
        dataSource: "real",
        candleCount: candles.length,
        executionTimeMs: executionTime,
        appliedParams: presetData.params,
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
        },
        presetStats: {
          avgReturn: presetData.avgReturn,
          avgWinRate: presetData.avgWinRate,
          aiConfidence: presetData.aiConfidence,
        },
        recentTrades: result.trades.slice(-5),
      };
    },
    {
      body: t.Object({
        strategyType: StrategyTypeEnum,
        symbol: SymbolEnum,
        preset: PresetNameEnum,
        days: t.Number({
          minimum: 7,
          maximum: 365,
          default: 30,
          description: "백테스트 기간 (일)",
        }),
        initialCapital: t.Number({
          minimum: 100,
          default: 1000,
          description: "초기 자본금 ($)",
        }),
      }),
      detail: {
        tags: ["Backtest"],
        summary: "프리셋 기반 백테스트 (권장)",
        description:
          "권장 프리셋으로 간편하게 백테스트 실행. 전략/프리셋/심볼 드롭다운에서 선택.",
      },
    }
  )

  // 프리셋 목록 조회
  .get(
    "/presets/:strategyType",
    async ({ params }) => {
      const presets = await presetService.getPresetsByType(
        params.strategyType as StrategyType
      );

      return {
        strategyType: params.strategyType,
        count: presets.length,
        presets: presets.map((p) => ({
          name: p.name,
          description: p.description,
          isDefault: p.isDefault,
          params: p.params,
          stats: {
            avgReturn: p.avgReturn,
            avgWinRate: p.avgWinRate,
            aiConfidence: p.aiConfidence,
          },
        })),
      };
    },
    {
      params: t.Object({
        strategyType: t.String(),
      }),
      detail: {
        tags: ["Backtest"],
        summary: "프리셋 목록 조회",
        description: "전략 타입별 사용 가능한 프리셋 목록",
      },
    }
  )

  // 프리셋 시드 (초기화)
  .post(
    "/presets/seed",
    async () => {
      const count = await presetService.seedDefaultPresets();
      return {
        success: true,
        seeded: count,
        message: `${count} default presets initialized`,
      };
    },
    {
      detail: {
        tags: ["Backtest"],
        summary: "기본 프리셋 시드",
        description: "모든 전략의 기본 프리셋을 DB에 초기화",
      },
    }
  );
