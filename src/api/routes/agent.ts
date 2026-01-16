// src/api/routes/agent.ts
import { Elysia, t } from "elysia";
import {
  agentManager,
  type AgentConfig,
} from "../../modules/agent/trading-agent";

// ============================================
// 스키마 정의
// ============================================

const CreateAgentSchema = t.Object({
  name: t.String({ minLength: 1 }),
  strategyType: t.Union([t.Literal("grid_bot"), t.Literal("momentum")]),
  symbol: t.String({ default: "BTC" }),
  initialCapital: t.Number({ minimum: 100, default: 1000 }),
  backtestDays: t.Number({ minimum: 7, maximum: 90, default: 30 }),
  optimizationRounds: t.Number({ minimum: 10, maximum: 500, default: 50 }),

  // 성능 기준
  minWinRate: t.Number({ minimum: 0.3, maximum: 0.9, default: 0.5 }),
  minProfitFactor: t.Number({ minimum: 1.0, maximum: 3.0, default: 1.5 }),
  maxDrawdownPercent: t.Number({ minimum: 5, maximum: 30, default: 15 }),
  minSharpeRatio: t.Number({ minimum: 0.5, maximum: 3.0, default: 1.0 }),

  // 자동화 설정
  autoEnableLive: t.Optional(t.Boolean({ default: false })),
  paperTradingFirst: t.Optional(t.Boolean({ default: true })),

  // 파라미터 범위 (선택)
  paramRanges: t.Optional(
    t.Record(
      t.String(),
      t.Object({
        min: t.Number(),
        max: t.Number(),
        step: t.Number(),
      })
    )
  ),
});

// ============================================
// 라우트
// ============================================

export const agentRoutes = new Elysia({ prefix: "/agent" })

  // 에이전트 목록
  .get(
    "/",
    () => {
      const agents = agentManager.getAll();
      return {
        count: agents.length,
        agents: agents.map((a) => ({
          name: a.getConfig().name,
          status: a.getState().status,
          liveEnabled: a.getState().liveEnabled,
          bestScore: a.getState().bestResult
            ? {
                winRate: a.getState().bestResult!.winRate,
                profitFactor: a.getState().bestResult!.profitFactor,
                sharpeRatio: a.getState().bestResult!.sharpeRatio,
              }
            : null,
        })),
      };
    },
    {
      detail: {
        tags: ["Agent"],
        summary: "에이전트 목록",
        description: "모든 트레이딩 에이전트 목록 조회",
      },
    }
  )

  // 에이전트 생성
  .post(
    "/",
    async ({ body, set }) => {
      // 중복 체크
      if (agentManager.get(body.name)) {
        set.status = 400;
        return { error: `Agent '${body.name}' already exists` };
      }

      // 기본 파라미터 범위 설정
      const paramRanges =
        body.paramRanges || getDefaultParamRanges(body.strategyType);

      const config: AgentConfig = {
        name: body.name,
        strategyType: body.strategyType,
        symbol: body.symbol,
        initialCapital: body.initialCapital,
        backtestDays: body.backtestDays,
        optimizationRounds: body.optimizationRounds,
        minWinRate: body.minWinRate,
        minProfitFactor: body.minProfitFactor,
        maxDrawdownPercent: body.maxDrawdownPercent,
        minSharpeRatio: body.minSharpeRatio,
        autoEnableLive: body.autoEnableLive || false,
        paperTradingFirst: body.paperTradingFirst ?? true,
        paramRanges,
      };

      const agent = agentManager.create(config);

      return {
        message: "Agent created successfully",
        name: body.name,
        config: agent.getConfig(),
        hint: `Start with POST /agent/${body.name}/start`,
      };
    },
    {
      body: CreateAgentSchema,
      detail: {
        tags: ["Agent"],
        summary: "에이전트 생성",
        description: "새 트레이딩 에이전트 생성",
      },
    }
  )

  // 에이전트 상세
  .get(
    "/:name",
    ({ params, set }) => {
      const agent = agentManager.get(params.name);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }

      const state = agent.getState();
      return {
        config: agent.getConfig(),
        state: {
          status: state.status,
          currentRound: state.currentRound,
          totalRounds: state.totalRounds,
          liveEnabled: state.liveEnabled,
          lastUpdated: state.lastUpdated,
        },
        bestResult: state.bestResult
          ? {
              winRate: state.bestResult.winRate,
              profitFactor: state.bestResult.profitFactor,
              sharpeRatio: state.bestResult.sharpeRatio,
              maxDrawdown: state.bestResult.maxDrawdownPercent,
              totalReturn: state.bestResult.totalReturnPercent,
              totalTrades: state.bestResult.totalTrades,
            }
          : null,
        bestParams: state.bestParams,
        paperTradingResults: state.paperTradingResults,
        optimizationHistory: state.optimizationHistory.slice(-10), // 최근 10개
        recentLogs: state.logs.slice(-20),
      };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: {
        tags: ["Agent"],
        summary: "에이전트 상세",
        description: "에이전트 상태 및 최적화 결과 조회",
      },
    }
  )

  // 에이전트 시작
  .post(
    "/:name/start",
    async ({ params, set }) => {
      const agent = agentManager.get(params.name);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }

      // 비동기로 시작 (백그라운드에서 실행)
      agent.start().catch(console.error);

      return {
        message: "Agent started",
        name: params.name,
        status: agent.getState().status,
        hint: `Monitor at GET /agent/${params.name}`,
      };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: {
        tags: ["Agent"],
        summary: "에이전트 시작",
        description: "에이전트 최적화 루프 시작",
      },
    }
  )

  // 에이전트 중지
  .post(
    "/:name/stop",
    ({ params, set }) => {
      const agent = agentManager.get(params.name);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }

      agent.stop();
      return { message: "Stop requested", name: params.name };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: {
        tags: ["Agent"],
        summary: "에이전트 중지",
        description: "에이전트 최적화 중지",
      },
    }
  )

  // Live 승인
  .post(
    "/:name/approve",
    ({ params, set }) => {
      const agent = agentManager.get(params.name);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }

      agent.approve();
      return {
        message: "Approval processed",
        liveEnabled: agent.getState().liveEnabled,
      };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: {
        tags: ["Agent"],
        summary: "Live 승인",
        description: "최적화 결과 승인 및 Live 전환",
      },
    }
  )

  // 일시정지
  .post(
    "/:name/pause",
    ({ params, set }) => {
      const agent = agentManager.get(params.name);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }

      agent.pause();
      return { message: "Agent paused", status: agent.getState().status };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: {
        tags: ["Agent"],
        summary: "에이전트 일시정지",
      },
    }
  )

  // 재개
  .post(
    "/:name/resume",
    ({ params, set }) => {
      const agent = agentManager.get(params.name);
      if (!agent) {
        set.status = 404;
        return { error: "Agent not found" };
      }

      agent.resume();
      return { message: "Agent resumed", status: agent.getState().status };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: {
        tags: ["Agent"],
        summary: "에이전트 재개",
      },
    }
  )

  // 삭제
  .delete(
    "/:name",
    ({ params, set }) => {
      const removed = agentManager.remove(params.name);
      if (!removed) {
        set.status = 404;
        return { error: "Agent not found" };
      }
      return { message: "Agent removed" };
    },
    {
      params: t.Object({ name: t.String() }),
      detail: {
        tags: ["Agent"],
        summary: "에이전트 삭제",
      },
    }
  );

// ============================================
// 헬퍼
// ============================================

function getDefaultParamRanges(strategyType: "grid_bot" | "momentum") {
  if (strategyType === "grid_bot") {
    return {
      gridCount: { min: 5, max: 30, step: 5 },
      leverage: { min: 1, max: 5, step: 1 },
      stopLossPercent: { min: 3, max: 10, step: 1 },
    };
  } else {
    return {
      rsiOversold: { min: 20, max: 40, step: 5 },
      rsiOverbought: { min: 60, max: 80, step: 5 },
      stopLossPercent: { min: 1, max: 5, step: 0.5 },
      takeProfitPercent: { min: 3, max: 10, step: 1 },
      leverage: { min: 1, max: 5, step: 1 },
    };
  }
}
