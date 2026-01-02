// src/modules/trade/model.ts
import { t } from "elysia";

// ============================================
// 공통 타입
// ============================================
export const TradeSide = t.Union([t.Literal("long"), t.Literal("short")]);
export const TradeStatus = t.Union([t.Literal("open"), t.Literal("closed")]);
export const ExitReason = t.Union([
  t.Literal("tp"),
  t.Literal("sl"),
  t.Literal("trailing_stop"),
  t.Literal("manual"),
  t.Literal("liquidation"),
]);

// ============================================
// 기술 지표 스냅샷
// ============================================
export const IndicatorSnapshot = t.Object({
  rsi: t.Number(),
  rsi5m: t.Optional(t.Number()),
  ema20: t.Number(),
  ema50: t.Number(),
  ema100: t.Number(),
  bbUpper: t.Number(),
  bbMiddle: t.Number(),
  bbLower: t.Number(),
  bbPosition: t.Union([
    t.Literal("above_upper"),
    t.Literal("within"),
    t.Literal("below_lower"),
  ]),
  adx: t.Number(),
  plusDI: t.Number(),
  minusDI: t.Number(),
  macd: t.Number(),
  macdSignal: t.Number(),
  macdHistogram: t.Number(),
  macdCrossover: t.Optional(
    t.Union([t.Literal("bullish"), t.Literal("bearish"), t.Literal("none")])
  ),
  atr: t.Number(),
  volume24h: t.Optional(t.Number()),
});

// ============================================
// API 스키마
// ============================================
export const TradeSchema = {
  // GET /trades/recent
  listQuery: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
    symbol: t.Optional(t.String()),
    side: t.Optional(TradeSide),
    status: t.Optional(TradeStatus),
    strategyId: t.Optional(t.String()),
    from: t.Optional(t.String()), // ISO date
    to: t.Optional(t.String()),
  }),

  listRes: t.Array(
    t.Object({
      id: t.String(),
      symbol: t.String(),
      side: TradeSide,
      entryPrice: t.Number(),
      exitPrice: t.Optional(t.Number()),
      size: t.Number(),
      leverage: t.Number(),
      pnl: t.Optional(t.Number()),
      pnlPercent: t.Optional(t.Number()),
      exitReason: t.Optional(ExitReason),
      status: TradeStatus,
      entryTime: t.String(),
      exitTime: t.Optional(t.String()),
      strategyId: t.String(),
    })
  ),

  // GET /trades/open
  openRes: t.Array(
    t.Object({
      id: t.String(),
      symbol: t.String(),
      side: TradeSide,
      entryPrice: t.Number(),
      size: t.Number(),
      leverage: t.Number(),
      unrealizedPnl: t.Number(),
      unrealizedPnlPercent: t.Number(),
      entryTime: t.String(),
      strategyId: t.String(),
    })
  ),

  // POST /trades (수동 진입)
  createBody: t.Object({
    symbol: t.String(),
    side: TradeSide,
    entryPrice: t.Number(),
    size: t.Number(),
    leverage: t.Number({ minimum: 1, maximum: 20 }),
    strategyId: t.String(),
    indicators: t.Optional(IndicatorSnapshot),
  }),

  createRes: t.Object({
    id: t.String(),
    symbol: t.String(),
    side: TradeSide,
    entryPrice: t.Number(),
    size: t.Number(),
    status: TradeStatus,
  }),

  // POST /trades/:id/close (수동 청산)
  closeParams: t.Object({
    id: t.String(),
  }),

  closeBody: t.Object({
    exitPrice: t.Number(),
    exitReason: ExitReason,
  }),

  closeRes: t.Object({
    id: t.String(),
    exitPrice: t.Number(),
    pnl: t.Number(),
    pnlPercent: t.Number(),
    exitReason: ExitReason,
    status: TradeStatus,
  }),
};

// ============================================
// 거래 통계 스키마
// ============================================
export const TradeStatsSchema = {
  // GET /trades/stats
  query: t.Object({
    period: t.Optional(
      t.Union([
        t.Literal("day"),
        t.Literal("week"),
        t.Literal("month"),
        t.Literal("all"),
      ])
    ),
    strategyId: t.Optional(t.String()),
  }),

  res: t.Object({
    totalTrades: t.Number(),
    winCount: t.Number(),
    lossCount: t.Number(),
    winRate: t.Number(),
    totalPnl: t.Number(),
    avgPnlPercent: t.Number(),
    profitFactor: t.Number(),
    maxDrawdown: t.Number(),
    avgHoldTimeMinutes: t.Number(),
  }),
};
