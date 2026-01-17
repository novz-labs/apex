// src/api/routes/strategy.ts
import { GridBotStrategy, type GridConfig } from "@strategy/grid-bot.service";
import {
  DEFAULT_MOMENTUM_CONFIG,
  type MomentumConfig,
} from "@strategy/momentum.service";
import { Elysia, t } from "elysia";

import { prisma } from "@db/prisma";
import { presetService } from "@strategy/preset.service";
import { strategyService } from "@strategy/strategy.service";
import { getInfoClient } from "../../modules/hyperliquid";

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
  .get(
    "/",
    () => {
      const all = strategyService.getAllStrategies();
      const strategies = all.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        enabled: s.enabled,
        isAgentic: s.isAgentic,
        allocation: s.allocation,
      }));
      return { strategies, count: strategies.length };
    },
    {
      detail: {
        tags: ["Strategy"],
        summary: "전략 목록 조회",
        description: "DB에 저장된 모든 전략 목록",
      },
    },
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
        config,
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
    },
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
        config,
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
    },
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
        isAgentic: instance.isAgentic,
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
    },
  )

  /**
   * 에이전트 모드 (자율 최적화) 토글
   */
  .post(
    "/:id/agentic",
    async ({ params, body, set }) => {
      try {
        const instance = strategyService.getStrategy(params.id);
        if (!instance) throw new Error("Strategy not found");

        await prisma.strategy.update({
          where: { id: params.id },
          data: { isAgentic: body.enabled },
        });

        instance.isAgentic = body.enabled;
        return { id: params.id, isAgentic: body.enabled };
      } catch (e: any) {
        set.status = 404;
        return { message: e.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ enabled: t.Boolean() }),
      detail: {
        tags: ["Strategy"],
        summary: "에이전트 자율 모드 토글",
      },
    },
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
    },
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
    },
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
    },
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
    },
  )
  // ============================================
  // 프리셋 기반 전략 배포 (Deploy from Preset)
  // ============================================
  .post(
    "/deploy-preset",
    async ({ body, set }) => {
      const { strategyType, presetName, symbol } = body;

      // 1. 프리셋 조회
      const preset = await presetService.getPreset(
        strategyType as any,
        presetName,
        symbol,
      );
      if (!preset) {
        set.status = 404;
        return {
          message: `Preset '${presetName}' for ${strategyType} not found`,
        };
      }

      // 2. 파라미터 보강 (Grid Bot의 경우 upper/lower price 자동 계산)
      const params = { ...preset.params };
      let currentPrice = 0;

      if (strategyType === "grid_bot") {
        try {
          const info = getInfoClient();
          const hlSymbol = symbol === "*" ? "BTC" : symbol;
          const l2 = await info.l2Book({ coin: hlSymbol });
          if (l2 && l2.levels && l2.levels[0] && l2.levels[0][0]) {
            currentPrice = parseFloat(l2.levels[0][0].px);
          }

          // 만약 upperPrice/lowerPrice가 없으면 현재가 기준으로 계산
          if (!params.upperPrice || !params.lowerPrice) {
            const count = params.gridCount || 10;
            const spacing = params.gridSpacing || 1.0; // 1% spacing
            const halfRangePercent = (spacing * count) / 2 / 100;

            params.lowerPrice = currentPrice * (1 - halfRangePercent);
            params.upperPrice = currentPrice * (1 + halfRangePercent);
            console.log(
              `🤖 Calculated Grid Range: ${params.lowerPrice.toFixed(2)} - ${params.upperPrice.toFixed(2)} based on price ${currentPrice}`,
            );
          }
        } catch (e) {
          console.warn("Failed to fetch price for grid init", e);
          // 기본값이라도 설정 (BTC 기준 예시)
          if (!params.upperPrice) params.upperPrice = 105000;
          if (!params.lowerPrice) params.lowerPrice = 95000;
        }
      }

      // 3. 전략 생성
      const name = `${strategyType}_${presetName}_${symbol}_${Date.now()}`;
      const dbEntry = await strategyService.createStrategy(
        name,
        strategyType as any,
        params,
      );

      // 4. 전략 활성화 (Start)
      await strategyService.toggleStrategy(dbEntry.id, true);

      // 5. Grid Bot 초기화
      const instance = strategyService.getStrategy(dbEntry.id)!;
      if (strategyType === "grid_bot") {
        (instance.strategy as GridBotStrategy).initializeGrids(currentPrice);
      }

      return {
        id: dbEntry.id,
        name: dbEntry.name,
        type: strategyType,
        config: params,
        message: "Bot deployed successfully from optimized preset",
      };
    },
    {
      body: t.Object({
        strategyType: t.String({
          description: "전략 타입 (grid_bot, momentum 등)",
        }),
        presetName: t.String({
          default: "recommended",
          description: "프리셋 이름",
        }),
        symbol: t.String({ default: "BTC", description: "심볼" }),
      }),
      detail: {
        tags: ["Strategy"],
        summary: "프리셋 기반 봇 배포",
        description:
          "최적화된 프리셋 설정을 사용하여 즉시 실매매 봇을 가동합니다.",
      },
    },
  );
