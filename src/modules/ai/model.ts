// src/modules/ai/model.ts
import { t } from "elysia";

// ============================================
// 공통 타입
// ============================================
export const TriggerType = t.Union([
  t.Literal("trade_count"),
  t.Literal("consecutive_loss"),
  t.Literal("drawdown"),
  t.Literal("manual"),
]);

export const RiskLevel = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("critical"),
]);

export const RecommendationType = t.Union([
  t.Literal("adjust_params"),
  t.Literal("adjust_allocation"),
  t.Literal("pause_strategy"),
  t.Literal("resume_strategy"),
  t.Literal("adjust_risk"),
  t.Literal("change_strategy"),
]);

export const Priority = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("critical"),
]);

// ============================================
// AI 추천사항 스키마
// ============================================
export const AIRecommendation = t.Object({
  type: RecommendationType,
  priority: Priority,
  targetStrategy: t.Optional(t.String()),
  changes: t.Record(t.String(), t.Unknown()),
  reason: t.String(),
  expectedImpact: t.String(),
  confidence: t.Number({ minimum: 0, maximum: 1 }),
  autoApplyable: t.Boolean(),
});

// ============================================
// API 스키마
// ============================================
export const AISchema = {
  // POST /ai/analyze
  analyzeBody: t.Object({
    triggerType: TriggerType,
    forceAnalysis: t.Optional(t.Boolean({ default: false })),
  }),

  analyzeRes: t.Object({
    id: t.String(),
    triggerType: TriggerType,
    confidence: t.Number(),
    riskLevel: RiskLevel,
    summary: t.String(),
    recommendations: t.Array(AIRecommendation),
    appliedCount: t.Number(),
    skippedCount: t.Number(),
    inputTokens: t.Number(),
    outputTokens: t.Number(),
    createdAt: t.String(),
  }),

  // GET /ai/history
  historyQuery: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 10 })),
    triggerType: t.Optional(TriggerType),
  }),

  historyRes: t.Array(
    t.Object({
      id: t.String(),
      triggerType: TriggerType,
      confidence: t.Number(),
      riskLevel: RiskLevel,
      appliedCount: t.Number(),
      skippedCount: t.Number(),
      inputTokens: t.Number(),
      outputTokens: t.Number(),
      createdAt: t.String(),
    })
  ),

  // GET /ai/history/:id (상세)
  detailParams: t.Object({
    id: t.String(),
  }),

  detailRes: t.Object({
    id: t.String(),
    triggerType: TriggerType,
    inputContext: t.String(), // JSON string
    analysisText: t.String(),
    confidence: t.Number(),
    riskLevel: RiskLevel,
    recommendations: t.String(), // JSON string
    appliedCount: t.Number(),
    skippedCount: t.Number(),
    inputTokens: t.Number(),
    outputTokens: t.Number(),
    createdAt: t.String(),
  }),
};

// ============================================
// AI 설정 스키마
// ============================================
export const AISettingsSchema = {
  // GET /ai/settings
  getRes: t.Object({
    enabled: t.Boolean(),
    minInterval: t.Number(),
    autoApply: t.Boolean(),
    maxChangeRate: t.Number(),
  }),

  // PATCH /ai/settings
  updateBody: t.Partial(
    t.Object({
      enabled: t.Boolean(),
      minInterval: t.Number({ minimum: 30, maximum: 1440 }),
      autoApply: t.Boolean(),
      maxChangeRate: t.Number({ minimum: 5, maximum: 50 }),
    })
  ),

  updateRes: t.Object({
    enabled: t.Boolean(),
    minInterval: t.Number(),
    autoApply: t.Boolean(),
    maxChangeRate: t.Number(),
    updatedAt: t.String(),
  }),
};
