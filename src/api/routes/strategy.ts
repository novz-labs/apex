// src/api/routes/strategy.ts
import { GridBotStrategy, type GridConfig } from "@strategy/grid-bot.service";
import {
  DEFAULT_MOMENTUM_CONFIG,
  type MomentumConfig,
} from "@strategy/momentum.service";
import { Elysia, t } from "elysia";

import { strategyService } from "@strategy/strategy.service";

// ============================================
// 스키마 정의
// ============================================

const GridConfigSchema = t.Object({
  symbol: t.String(),
  upperPrice: t.Number(),
  lowerPrice: t.Number(),
  gridCount: t.Number({ minimum: 5, maximum: 50 }),
  totalCapital: t.Number({ minimum: 100 }),
  leverage: t.Number({ minimum: 1, maximum: 10 }),
  stopLossPercent: t.Number({ minimum: 1, maximum: 20 }),
});

const MomentumConfigSchema = t.Object({
  symbol: t.String(),
  rsiOversold: t.Optional(t.Number({ minimum: 10, maximum: 40 })),
  rsiOverbought: t.Optional(t.Number({ minimum: 60, maximum: 90 })),
  bbStdDev: t.Optional(t.Number({ minimum: 1, maximum: 3 })),
  adxThreshold: t.Optional(t.Number({ minimum: 15, maximum: 40 })),
  leverage: t.Optional(t.Number({ minimum: 1, maximum: 10 })),
  stopLossPercent: t.Optional(t.Number({ minimum: 1, maximum: 10 })),
  takeProfitPercent: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
  trailingStopPercent: t.Optional(t.Number({ minimum: 0.5, maximum: 5 })),
  totalCapital: t.Number({ minimum: 100 }),
});

const IndicatorSnapshotSchema = t.Object({
  rsi: t.Number(),
  bbPosition: t.Union([
    t.Literal("above_upper"),
    t.Literal("below_lower"),
    t.Literal("within"),
  ]),
  bbUpper: t.Number(),
  bbMiddle: t.Number(),
  bbLower: t.Number(),
  adx: t.Number(),
  plusDI: t.Number(),
  minusDI: t.Number(),
  ema20: t.Number(),
  ema50: t.Number(),
  ema100: t.Number(),
  macdCrossover: t.Union([
    t.Literal("bullish"),
    t.Literal("bearish"),
    t.Literal("none"),
  ]),
  macdLine: t.Number(),
  signalLine: t.Number(),
  macdHistogram: t.Number(),
});

// ============================================
// 라우트 정의
// ============================================

export const strategyRoutes = new Elysia({ prefix: "/strategy" })
  // ============================================
  // 전략 목록 조회
  // ============================================
  .get(
    "/",
    async () => {
      const strategies = strategyService.getAllStrategies().map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        isRunning: s.enabled,
      }));
      return { strategies, count: strategies.length };
    },
    {
      detail: {
        tags: ["Strategy"],
        summary: "전략 목록 조회",
        description: "DB에 저장된 모든 전략 목록",
      },
    }
  )

  // ============================================
  // Grid Bot 전략 생성
  // ============================================
  .post(
    "/grid-bot",
    async ({ body }) => {
      const config: GridConfig = body;
      const name = `GridBot_${body.symbol}_${Date.now()}`;
      const dbEntry = await strategyService.createStrategy(
        name,
        "grid_bot",
        config
      );

      const instance = strategyService.getStrategy(dbEntry.id)!;
      (instance.strategy as GridBotStrategy).initializeGrids();

      return {
        id: dbEntry.id,
        name: dbEntry.name,
        type: "grid_bot",
        config,
        message: "Grid Bot strategy created and initialized",
      };
    },
    {
      body: GridConfigSchema,
      detail: {
        tags: ["Strategy"],
        summary: "Grid Bot 전략 생성",
      },
    }
  )

  // ============================================
  // Momentum 전략 생성
  // ============================================
  .post(
    "/momentum",
    async ({ body }) => {
      const config: MomentumConfig = {
        ...DEFAULT_MOMENTUM_CONFIG,
        ...body,
      } as MomentumConfig;

      const name = `Momentum_${body.symbol}_${Date.now()}`;
      const dbEntry = await strategyService.createStrategy(
        name,
        "momentum",
        config
      );

      return {
        id: dbEntry.id,
        name: dbEntry.name,
        type: "momentum",
        config,
        message: "Momentum strategy created",
      };
    },
    {
      body: MomentumConfigSchema,
      detail: {
        tags: ["Strategy"],
        summary: "Momentum 전략 생성",
      },
    }
  )

  // ============================================
  // 전략 상세 조회
  // ============================================
  .get(
    "/:id",
    ({ params, set }) => {
      const instance = strategyService.getStrategy(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      const stats = instance.strategy.getStats();
      const config = instance.strategy.getConfig();

      return {
        id: instance.id,
        name: instance.name,
        type: instance.type,
        enabled: instance.enabled,
        config,
        stats,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 상세 조회",
      },
    }
  )

  // ============================================
  // 전략 시작/중지
  // ============================================
  .post(
    "/:id/start",
    async ({ params, set }) => {
      try {
        await strategyService.toggleStrategy(params.id, true);
        return { id: params.id, action: "started" };
      } catch (e: any) {
        set.status = 404;
        return { message: e.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 시작",
      },
    }
  )

  .post(
    "/:id/stop",
    async ({ params, set }) => {
      try {
        await strategyService.toggleStrategy(params.id, false);
        return { id: params.id, action: "stopped" };
      } catch (e: any) {
        set.status = 404;
        return { message: e.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 중지",
      },
    }
  )

  // ============================================
  // 전략 가격 업데이트
  // ============================================
  .post(
    "/:id/price-update",
    ({ params, body, set }) => {
      const instance = strategyService.getStrategy(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      const result = instance.strategy.onPriceUpdate(body.currentPrice);
      return {
        id: params.id,
        type: instance.type,
        result,
        stats: instance.strategy.getStats(),
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ currentPrice: t.Number() }),
      detail: {
        tags: ["Strategy"],
        summary: "가격 업데이트",
      },
    }
  )

  // ============================================
  // 전략 삭제
  // ============================================
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await strategyService.deleteStrategy(params.id);
        return { id: params.id, action: "deleted" };
      } catch (e: any) {
        set.status = 404;
        return { message: e.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 삭제",
      },
    }
  );
