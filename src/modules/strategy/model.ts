// src/modules/strategy/model.ts
import { t } from "elysia";

// ============================================
// 공통 타입
// ============================================
export const StrategyType = t.Union([
  t.Literal("grid_bot"),
  t.Literal("momentum"),
  t.Literal("scalping"),
  t.Literal("funding_arb"),
]);

export const ParamChangeSource = t.Union([
  t.Literal("ai"),
  t.Literal("manual"),
]);

// ============================================
// 전략별 파라미터 스키마
// ============================================
export const GridBotParams = t.Object({
  type: t.Literal("grid_bot"),
  symbol: t.String(),
  upperPrice: t.Number(),
  lowerPrice: t.Number(),
  gridCount: t.Number({ minimum: 5, maximum: 50 }),
  leverage: t.Number({ minimum: 1, maximum: 10 }),
  stopLossPercent: t.Number({ minimum: 1, maximum: 20 }),
});

export const MomentumParams = t.Object({
  type: t.Literal("momentum"),
  symbol: t.String(),
  rsiOversold: t.Number({ minimum: 10, maximum: 40 }),
  rsiOverbought: t.Number({ minimum: 60, maximum: 90 }),
  bbStdDev: t.Number({ minimum: 1, maximum: 3 }),
  adxThreshold: t.Number({ minimum: 15, maximum: 40 }),
  leverage: t.Number({ minimum: 1, maximum: 10 }),
  stopLossPercent: t.Number({ minimum: 1, maximum: 10 }),
  takeProfitPercent: t.Number({ minimum: 2, maximum: 20 }),
  trailingStopPercent: t.Number({ minimum: 0.5, maximum: 5 }),
});

export const ScalpingParams = t.Object({
  type: t.Literal("scalping"),
  symbol: t.String(),
  timeframe: t.Union([t.Literal("1m"), t.Literal("5m")]),
  rsiLow: t.Number({ minimum: 15, maximum: 35 }),
  rsiHigh: t.Number({ minimum: 65, maximum: 85 }),
  targetProfitPercent: t.Number({ minimum: 0.1, maximum: 1 }),
  stopLossPercent: t.Number({ minimum: 0.1, maximum: 0.5 }),
  minVolume24h: t.Number(),
  maxSpreadPercent: t.Number({ minimum: 0.01, maximum: 0.1 }),
  maxDailyTrades: t.Number({ minimum: 5, maximum: 50 }),
  maxDailyLoss: t.Number({ minimum: 10, maximum: 100 }),
});

export const FundingArbParams = t.Object({
  type: t.Literal("funding_arb"),
  symbols: t.Array(t.String()),
  minFundingRate: t.Number({ minimum: 0.0001, maximum: 0.01 }),
  positionSizePercent: t.Number({ minimum: 5, maximum: 50 }),
  maxConcurrent: t.Number({ minimum: 1, maximum: 10 }),
});

export const StrategyParams = t.Union([
  GridBotParams,
  MomentumParams,
  ScalpingParams,
  FundingArbParams,
]);

// ============================================
// API 스키마
// ============================================
export const StrategySchema = {
  // GET /strategies/:id
  getParams: t.Object({
    id: t.String(),
  }),

  // GET /strategies
  listRes: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      type: StrategyType,
      enabled: t.Boolean(),
      allocation: t.Number(),
      winRate: t.Number(),
      profitFactor: t.Number(),
      totalPnl: t.Number(),
      totalTrades: t.Number(),
    })
  ),

  // POST /strategies
  createBody: t.Object({
    name: t.String({ minLength: 1, maxLength: 50 }),
    type: StrategyType,
    allocation: t.Number({ minimum: 0, maximum: 1 }),
    params: StrategyParams,
  }),

  createRes: t.Object({
    id: t.String(),
    name: t.String(),
    type: StrategyType,
    enabled: t.Boolean(),
    allocation: t.Number(),
  }),

  // POST /strategies/:id/toggle
  toggleRes: t.Object({
    id: t.String(),
    enabled: t.Boolean(),
  }),

  // PATCH /strategies/:id/params
  updateParamsBody: t.Partial(
    t.Object({
      allocation: t.Number({ minimum: 0, maximum: 1 }),
      params: t.Partial(StrategyParams),
    })
  ),

  updateParamsRes: t.Object({
    id: t.String(),
    allocation: t.Number(),
    paramsJson: t.String(),
    updatedAt: t.String(),
  }),

  // 전략 상세 응답
  detailRes: t.Object({
    id: t.String(),
    name: t.String(),
    type: StrategyType,
    enabled: t.Boolean(),
    allocation: t.Number(),
    paramsJson: t.String(),
    winRate: t.Number(),
    profitFactor: t.Number(),
    totalPnl: t.Number(),
    totalTrades: t.Number(),
    createdAt: t.String(),
    updatedAt: t.String(),
  }),
};

// ============================================
// 파라미터 변경 이력 스키마
// ============================================
export const ParamHistorySchema = {
  listRes: t.Array(
    t.Object({
      id: t.String(),
      strategyId: t.String(),
      previousParams: t.String(),
      newParams: t.String(),
      changeReason: t.String(),
      source: ParamChangeSource,
      aiConfidence: t.Optional(t.Number()),
      createdAt: t.String(),
    })
  ),
};
