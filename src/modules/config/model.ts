// src/modules/config/model.ts
import { t } from "elysia";

// ============================================
// API 스키마
// ============================================
export const ConfigSchema = {
  // GET /config
  getRes: t.Object({
    id: t.String(),
    initialBalance: t.Number(),
    currentBalance: t.Number(),
    peakBalance: t.Number(),
    maxDrawdownLimit: t.Number(),
    maxLeverage: t.Number(),
    maxPositionSize: t.Number(),
    stopLossDefault: t.Number(),
    aiEnabled: t.Boolean(),
    aiMinInterval: t.Number(),
    aiAutoApply: t.Boolean(),
    aiMaxChangeRate: t.Number(),
    createdAt: t.String(),
    updatedAt: t.String(),
  }),

  // PATCH /config
  updateBody: t.Partial(
    t.Object({
      maxDrawdownLimit: t.Number({ minimum: 10, maximum: 50 }),
      maxLeverage: t.Number({ minimum: 1, maximum: 20 }),
      maxPositionSize: t.Number({ minimum: 10, maximum: 100 }),
      stopLossDefault: t.Number({ minimum: 0.5, maximum: 10 }),
      aiEnabled: t.Boolean(),
      aiMinInterval: t.Number({ minimum: 30, maximum: 1440 }),
      aiAutoApply: t.Boolean(),
      aiMaxChangeRate: t.Number({ minimum: 5, maximum: 50 }),
    })
  ),

  updateRes: t.Object({
    id: t.String(),
    maxDrawdownLimit: t.Number(),
    maxLeverage: t.Number(),
    maxPositionSize: t.Number(),
    stopLossDefault: t.Number(),
    aiEnabled: t.Boolean(),
    aiMinInterval: t.Number(),
    aiAutoApply: t.Boolean(),
    aiMaxChangeRate: t.Number(),
    updatedAt: t.String(),
  }),

  // POST /config/balance (잔고 업데이트)
  updateBalanceBody: t.Object({
    balance: t.Number({ minimum: 0 }),
    reason: t.Optional(t.String()),
  }),

  updateBalanceRes: t.Object({
    currentBalance: t.Number(),
    peakBalance: t.Number(),
    updatedAt: t.String(),
  }),
};

// ============================================
// 계정 스냅샷 스키마
// ============================================
export const SnapshotSchema = {
  // GET /snapshots
  listQuery: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 30 })),
    from: t.Optional(t.String()),
    to: t.Optional(t.String()),
  }),

  listRes: t.Array(
    t.Object({
      id: t.String(),
      date: t.String(),
      balance: t.Number(),
      equity: t.Number(),
      dailyPnl: t.Number(),
      dailyPnlPercent: t.Number(),
      drawdown: t.Number(),
      winRate: t.Number(),
      totalTrades: t.Number(),
      openPositions: t.Number(),
    })
  ),
};

// ============================================
// 상태 & 성과 스키마
// ============================================
export const StatusSchema = {
  // GET /status
  res: t.Object({
    account: t.Object({
      balance: t.Number(),
      equity: t.Number(),
      unrealizedPnl: t.Number(),
      realizedPnl: t.Number(),
      dailyPnl: t.Number(),
      dailyPnlPercent: t.Number(),
      currentDrawdown: t.Number(),
      maxDrawdown: t.Number(),
      openPositions: t.Number(),
      marginUsed: t.Number(),
      marginAvailable: t.Number(),
    }),
    risk: t.Object({
      maxDrawdownLimit: t.Number(),
      maxLeverage: t.Number(),
      currentLeverage: t.Number(),
      positionSizePercent: t.Number(),
    }),
    ai: t.Object({
      enabled: t.Boolean(),
      lastAnalysis: t.Optional(t.String()),
      nextAnalysisIn: t.Optional(t.Number()), // 분
    }),
  }),

  // GET /performance
  performanceQuery: t.Object({
    period: t.Optional(
      t.Union([
        t.Literal("day"),
        t.Literal("week"),
        t.Literal("month"),
        t.Literal("all"),
      ])
    ),
  }),

  performanceRes: t.Object({
    period: t.String(),
    startBalance: t.Number(),
    endBalance: t.Number(),
    totalPnl: t.Number(),
    totalPnlPercent: t.Number(),
    totalTrades: t.Number(),
    winRate: t.Number(),
    profitFactor: t.Number(),
    maxDrawdown: t.Number(),
    sharpeRatio: t.Optional(t.Number()),
    bestTrade: t.Number(),
    worstTrade: t.Number(),
  }),

  // GET /health
  healthRes: t.Object({
    status: t.Literal("ok"),
    uptime: t.Number(),
    timestamp: t.String(),
  }),
};
