// src/modules/market/model.ts
import { t } from "elysia";

// ============================================
// 공통 타입
// ============================================
export const Timeframe = t.Union([
  t.Literal("1m"),
  t.Literal("5m"),
  t.Literal("15m"),
  t.Literal("1h"),
  t.Literal("4h"),
  t.Literal("1d"),
]);

export const FearGreedClass = t.Union([
  t.Literal("Extreme Fear"),
  t.Literal("Fear"),
  t.Literal("Neutral"),
  t.Literal("Greed"),
  t.Literal("Extreme Greed"),
]);

export const MarketPhase = t.Union([
  t.Literal("accumulate"),
  t.Literal("hold"),
  t.Literal("reduce"),
  t.Literal("exit"),
]);

// ============================================
// 지표 스키마
// ============================================
export const IndicatorSchema = {
  // GET /indicators/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  query: t.Object({
    timeframe: t.Optional(Timeframe),
  }),

  res: t.Object({
    symbol: t.String(),
    timeframe: Timeframe,
    timestamp: t.String(),
    rsi: t.Number(),
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
    atr: t.Number(),
  }),
};

// ============================================
// 시그널 스키마
// ============================================
export const SignalSchema = {
  // GET /signals/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  res: t.Object({
    symbol: t.String(),
    timestamp: t.String(),
    direction: t.Union([
      t.Literal("long"),
      t.Literal("short"),
      t.Literal("none"),
    ]),
    confidence: t.Number(),
    reasons: t.Array(t.String()),
    suggestedEntry: t.Optional(t.Number()),
    suggestedSL: t.Optional(t.Number()),
    suggestedTP: t.Optional(t.Number()),
  }),
};

// ============================================
// 센티먼트 스키마
// ============================================
export const SentimentSchema = {
  // GET /sentiment
  res: t.Object({
    fearGreedIndex: t.Number(),
    fearGreedClass: FearGreedClass,
    googleTrendsBtc: t.Optional(t.Number()),
    sentimentScore: t.Number(),
    marketPhase: MarketPhase,
    updatedAt: t.String(),
  }),

  // GET /sentiment/history
  historyQuery: t.Object({
    days: t.Optional(t.Number({ minimum: 1, maximum: 90, default: 30 })),
  }),

  historyRes: t.Array(
    t.Object({
      date: t.String(),
      fearGreedIndex: t.Number(),
      fearGreedClass: FearGreedClass,
      sentimentScore: t.Number(),
      marketPhase: MarketPhase,
    })
  ),
};

// ============================================
// 캔들 스키마
// ============================================
export const CandleSchema = {
  // GET /candles/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  query: t.Object({
    timeframe: Timeframe,
    limit: t.Optional(t.Number({ minimum: 1, maximum: 1000, default: 100 })),
    from: t.Optional(t.String()),
    to: t.Optional(t.String()),
  }),

  res: t.Array(
    t.Object({
      openTime: t.String(),
      open: t.Number(),
      high: t.Number(),
      low: t.Number(),
      close: t.Number(),
      volume: t.Number(),
    })
  ),
};

// ============================================
// 펀딩비 스키마
// ============================================
export const FundingSchema = {
  // GET /funding/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  res: t.Object({
    symbol: t.String(),
    rate: t.Number(),
    ratePercent: t.Number(),
    nextFundingTime: t.String(),
    predictedRate: t.Optional(t.Number()),
    estimatedAPY: t.Number(),
  }),

  // GET /funding/top
  topQuery: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 10 })),
    direction: t.Optional(
      t.Union([t.Literal("positive"), t.Literal("negative")])
    ),
  }),

  topRes: t.Array(
    t.Object({
      symbol: t.String(),
      rate: t.Number(),
      ratePercent: t.Number(),
      nextFundingTime: t.String(),
      estimatedAPY: t.Number(),
    })
  ),
};

// ============================================
// 티커 스키마
// ============================================
export const TickerSchema = {
  // GET /ticker/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  res: t.Object({
    symbol: t.String(),
    lastPrice: t.Number(),
    bidPrice: t.Number(),
    askPrice: t.Number(),
    high24h: t.Number(),
    low24h: t.Number(),
    volume24h: t.Number(),
    change24h: t.Number(),
    changePercent24h: t.Number(),
    timestamp: t.String(),
  }),
};
