// src/api/routes/strategy.ts
import { Elysia, t } from "elysia";
import {
  GridBotStrategy,
  createGridBot,
  type GridConfig,
} from "../../modules/strategy/grid-bot.service";
import {
  DEFAULT_MOMENTUM_CONFIG,
  MomentumStrategy,
  createMomentumStrategy,
  type MomentumConfig,
} from "../../modules/strategy/momentum.service";

// ============================================
// 전략 인스턴스 저장소
// ============================================

interface StrategyInstance {
  id: string;
  type: "grid_bot" | "momentum";
  strategy: GridBotStrategy | MomentumStrategy;
  createdAt: Date;
}

const strategyStore = new Map<string, StrategyInstance>();

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
    () => {
      const strategies = Array.from(strategyStore.values()).map((s) => ({
        id: s.id,
        type: s.type,
        createdAt: s.createdAt.toISOString(),
        isRunning:
          s.type === "grid_bot"
            ? (s.strategy as GridBotStrategy).getStats().isRunning
            : (s.strategy as MomentumStrategy).getStats().isRunning,
      }));
      return { strategies, count: strategies.length };
    },
    {
      detail: {
        tags: ["Strategy"],
        summary: "전략 목록 조회",
        description: "생성된 모든 전략 인스턴스 목록",
      },
    }
  )

  // ============================================
  // Grid Bot 전략 생성
  // ============================================
  .post(
    "/grid-bot",
    ({ body }) => {
      const config: GridConfig = body;
      const strategy = createGridBot(config);
      const id = `grid_${Date.now()}`;

      strategyStore.set(id, {
        id,
        type: "grid_bot",
        strategy,
        createdAt: new Date(),
      });

      // 그리드 초기화
      const grids = strategy.initializeGrids();

      return {
        id,
        type: "grid_bot",
        config,
        gridsCount: grids.length,
        message: "Grid Bot strategy created and initialized",
      };
    },
    {
      body: GridConfigSchema,
      detail: {
        tags: ["Strategy"],
        summary: "Grid Bot 전략 생성",
        description: "새로운 Grid Bot 전략 인스턴스 생성",
      },
    }
  )

  // ============================================
  // Momentum 전략 생성
  // ============================================
  .post(
    "/momentum",
    ({ body }) => {
      const config: MomentumConfig = {
        ...DEFAULT_MOMENTUM_CONFIG,
        ...body,
      } as MomentumConfig;

      const strategy = createMomentumStrategy(config);
      const id = `momentum_${Date.now()}`;

      strategyStore.set(id, {
        id,
        type: "momentum",
        strategy,
        createdAt: new Date(),
      });

      strategy.start();

      return {
        id,
        type: "momentum",
        config,
        message: "Momentum strategy created and started",
      };
    },
    {
      body: MomentumConfigSchema,
      detail: {
        tags: ["Strategy"],
        summary: "Momentum 전략 생성",
        description: "새로운 Momentum 전략 인스턴스 생성",
      },
    }
  )

  // ============================================
  // 전략 상세 조회
  // ============================================
  .get(
    "/:id",
    ({ params, set }) => {
      const instance = strategyStore.get(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      const stats =
        instance.type === "grid_bot"
          ? (instance.strategy as GridBotStrategy).getStats()
          : (instance.strategy as MomentumStrategy).getStats();

      const config =
        instance.type === "grid_bot"
          ? (instance.strategy as GridBotStrategy).getConfig()
          : (instance.strategy as MomentumStrategy).getConfig();

      return {
        id: instance.id,
        type: instance.type,
        createdAt: instance.createdAt.toISOString(),
        config,
        stats,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 상세 조회",
        description: "전략 설정 및 통계 조회",
      },
    }
  )

  // ============================================
  // 전략 시작/중지
  // ============================================
  .post(
    "/:id/start",
    ({ params, set }) => {
      const instance = strategyStore.get(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      if (instance.type === "grid_bot") {
        (instance.strategy as GridBotStrategy).start();
      } else {
        (instance.strategy as MomentumStrategy).start();
      }

      return { id: params.id, action: "started" };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 시작",
        description: "전략 실행 시작",
      },
    }
  )

  .post(
    "/:id/stop",
    ({ params, set }) => {
      const instance = strategyStore.get(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      if (instance.type === "grid_bot") {
        (instance.strategy as GridBotStrategy).stop();
      } else {
        (instance.strategy as MomentumStrategy).stop();
      }

      return { id: params.id, action: "stopped" };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 중지",
        description: "전략 실행 중지",
      },
    }
  )

  // ============================================
  // Grid Bot 가격 업데이트
  // ============================================
  .post(
    "/:id/price-update",
    ({ params, body, set }) => {
      const instance = strategyStore.get(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      if (instance.type === "grid_bot") {
        const result = (instance.strategy as GridBotStrategy).onPriceUpdate(
          body.currentPrice
        );
        return {
          id: params.id,
          type: "grid_bot",
          executedOrders: result.executedOrders.length,
          shouldRebalance: result.shouldRebalance,
          stopLossTriggered: result.stopLossTriggered,
          stats: (instance.strategy as GridBotStrategy).getStats(),
        };
      } else {
        const result = (instance.strategy as MomentumStrategy).onPriceUpdate(
          body.currentPrice
        );
        return {
          id: params.id,
          type: "momentum",
          action: result.action,
          closedPnl: result.closedPnl,
          position: result.position,
          stats: (instance.strategy as MomentumStrategy).getStats(),
        };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ currentPrice: t.Number() }),
      detail: {
        tags: ["Strategy"],
        summary: "가격 업데이트",
        description: "현재 가격으로 전략 상태 업데이트",
      },
    }
  )

  // ============================================
  // Momentum 시그널 생성
  // ============================================
  .post(
    "/:id/generate-signal",
    ({ params, body, set }) => {
      const instance = strategyStore.get(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      if (instance.type !== "momentum") {
        set.status = 400;
        return { message: "This endpoint is only for Momentum strategy" };
      }

      const signal = (instance.strategy as MomentumStrategy).generateSignal(
        body.indicators,
        body.currentPrice
      );

      return {
        id: params.id,
        signal,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        indicators: IndicatorSnapshotSchema,
        currentPrice: t.Number(),
      }),
      detail: {
        tags: ["Strategy"],
        summary: "Momentum 시그널 생성",
        description: "지표를 기반으로 매매 시그널 생성",
      },
    }
  )

  // ============================================
  // Momentum 포지션 오픈
  // ============================================
  .post(
    "/:id/open-position",
    ({ params, body, set }) => {
      const instance = strategyStore.get(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      if (instance.type !== "momentum") {
        set.status = 400;
        return { message: "This endpoint is only for Momentum strategy" };
      }

      const strategy = instance.strategy as MomentumStrategy;

      // 먼저 시그널 생성
      const signal = strategy.generateSignal(
        body.indicators,
        body.currentPrice
      );

      if (signal.direction === "none") {
        return {
          id: params.id,
          opened: false,
          signal,
          message: "No signal generated",
        };
      }

      // 포지션 오픈
      const position = strategy.openPosition(signal);

      return {
        id: params.id,
        opened: !!position,
        signal,
        position,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        indicators: IndicatorSnapshotSchema,
        currentPrice: t.Number(),
      }),
      detail: {
        tags: ["Strategy"],
        summary: "Momentum 포지션 오픈",
        description: "시그널을 기반으로 포지션 진입",
      },
    }
  )

  // ============================================
  // 전략 삭제
  // ============================================
  .delete(
    "/:id",
    ({ params, set }) => {
      const instance = strategyStore.get(params.id);
      if (!instance) {
        set.status = 404;
        return { message: "Strategy not found" };
      }

      // 전략 중지
      if (instance.type === "grid_bot") {
        (instance.strategy as GridBotStrategy).stop();
      } else {
        (instance.strategy as MomentumStrategy).stop();
      }

      strategyStore.delete(params.id);

      return { id: params.id, action: "deleted" };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Strategy"],
        summary: "전략 삭제",
        description: "전략 인스턴스 삭제",
      },
    }
  );
