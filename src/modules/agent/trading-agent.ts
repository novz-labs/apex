// src/modules/agent/trading-agent.ts

import {
  generateSampleCandles,
  runBacktest,
  type BacktestConfig,
  type BacktestResult,
} from "../backtest/backtest.service";
import { telegramService } from "../notification/telegram.service";

// ============================================
// 타입 정의
// ============================================

export interface AgentConfig {
  // 에이전트 설정
  name: string;
  strategyType: "grid_bot" | "momentum";
  symbol: string;
  initialCapital: number;

  // 백테스트 설정
  backtestDays: number;
  optimizationRounds: number; // 최적화 반복 횟수

  // 성능 기준
  minWinRate: number; // 최소 승률 (0-1)
  minProfitFactor: number; // 최소 Profit Factor
  maxDrawdownPercent: number; // 최대 DD
  minSharpeRatio: number; // 최소 Sharpe

  // 자동 스위치 설정
  autoEnableLive: boolean; // 기준 충족 시 자동 활성화
  paperTradingFirst: boolean; // 먼저 Paper 모드로 테스트

  // 전략별 파라미터 범위 (Grid Bot 예시)
  paramRanges?: {
    [key: string]: { min: number; max: number; step: number };
  };
}

export interface AgentState {
  status:
    | "idle"
    | "backtesting"
    | "optimizing"
    | "paper_trading"
    | "live"
    | "paused";
  currentRound: number;
  totalRounds: number;
  bestResult: BacktestResult | null;
  bestParams: Record<string, number>;
  optimizationHistory: Array<{
    round: number;
    params: Record<string, number>;
    performance: {
      winRate: number;
      profitFactor: number;
      sharpeRatio: number;
      maxDrawdown: number;
      totalReturn: number;
    };
    passedCriteria: boolean;
  }>;
  liveEnabled: boolean;
  paperTradingResults?: {
    trades: number;
    winRate: number;
    pnl: number;
  };
  lastUpdated: string;
  logs: string[];
}

// ============================================
// 트레이딩 에이전트
// ============================================

export class TradingAgent {
  private config: AgentConfig;
  private state: AgentState;
  private isRunning: boolean = false;
  private stopRequested: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.state = {
      status: "idle",
      currentRound: 0,
      totalRounds: config.optimizationRounds,
      bestResult: null,
      bestParams: {},
      optimizationHistory: [],
      liveEnabled: false,
      lastUpdated: new Date().toISOString(),
      logs: [],
    };
  }

  /**
   * 에이전트 시작 - 자동 최적화 루프
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.log("⚠️ Agent already running");
      return;
    }

    this.isRunning = true;
    this.stopRequested = false;
    this.state.status = "optimizing";
    this.log(`🚀 Starting agent: ${this.config.name}`);

    try {
      // Phase 1: 최적화 루프
      await this.runOptimizationLoop();

      if (this.stopRequested) {
        this.log("⏹️ Agent stopped by user");
        return;
      }

      // Phase 2: 최적 파라미터가 기준을 충족하는지 체크
      if (this.checkCriteria(this.state.bestResult!)) {
        this.log("✅ Optimization criteria met!");

        // Phase 3: Paper Trading (선택)
        if (this.config.paperTradingFirst) {
          await this.runPaperTrading();
        }

        // Phase 4: Live 스위치 (자동 or 알림)
        if (
          this.config.autoEnableLive &&
          this.checkCriteria(this.state.bestResult!)
        ) {
          this.enableLiveTrading();
        } else {
          await this.notifyForApproval();
        }
      } else {
        this.log("❌ Optimization criteria not met. Staying in paper mode.");
        await telegramService.notifyAlert({
          level: "warning",
          title: "Agent Optimization Failed",
          message: `${this.config.name}: Could not find parameters meeting criteria after ${this.config.optimizationRounds} rounds`,
        });
      }
    } catch (error) {
      this.log(`❌ Agent error: ${error}`);
      this.state.status = "paused";
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 최적화 루프
   */
  private async runOptimizationLoop(): Promise<void> {
    this.log(
      `📊 Starting optimization: ${this.config.optimizationRounds} rounds`
    );

    const defaultParams = this.getDefaultParams();
    let bestScore = -Infinity;

    for (let round = 1; round <= this.config.optimizationRounds; round++) {
      if (this.stopRequested) break;

      this.state.currentRound = round;
      this.state.status = "backtesting";

      // 파라미터 변형 (랜덤 또는 그리드 서치)
      const params = this.mutateParams(defaultParams, round);

      // 백테스트 실행
      const candles = generateSampleCandles(this.config.backtestDays, 95000);
      const backTestConfig = this.buildBacktestConfig(params);
      const result = runBacktest(backTestConfig, candles);

      // 점수 계산 (복합 지표)
      const score = this.calculateScore(result);
      const passedCriteria = this.checkCriteria(result);

      // 히스토리 기록
      this.state.optimizationHistory.push({
        round,
        params,
        performance: {
          winRate: result.winRate,
          profitFactor: result.profitFactor,
          sharpeRatio: result.sharpeRatio,
          maxDrawdown: result.maxDrawdownPercent,
          totalReturn: result.totalReturnPercent,
        },
        passedCriteria,
      });

      // 최고 성능 업데이트
      if (score > bestScore) {
        bestScore = score;
        this.state.bestResult = result;
        this.state.bestParams = params;
        this.log(
          `🏆 New best at round ${round}: Score=${score.toFixed(2)}, WR=${(result.winRate * 100).toFixed(1)}%, PF=${result.profitFactor.toFixed(2)}`
        );
      }

      // 진행 상황 로그
      if (round % 10 === 0) {
        this.log(
          `📈 Round ${round}/${this.config.optimizationRounds} - Best score: ${bestScore.toFixed(2)}`
        );
      }

      this.state.lastUpdated = new Date().toISOString();
    }

    this.state.status = "idle";
    this.log(`✅ Optimization complete. Best score: ${bestScore.toFixed(2)}`);
  }

  /**
   * Paper Trading 시뮬레이션
   */
  private async runPaperTrading(): Promise<void> {
    this.log("📝 Starting paper trading simulation (7 days)");
    this.state.status = "paper_trading";

    // 7일 추가 백테스트로 Paper Trading 시뮬레이션
    const candles = generateSampleCandles(7, 95000);
    const config = this.buildBacktestConfig(this.state.bestParams);
    const result = runBacktest(config, candles);

    this.state.paperTradingResults = {
      trades: result.totalTrades,
      winRate: result.winRate,
      pnl: result.totalReturn,
    };

    this.log(
      `📝 Paper trading: ${result.totalTrades} trades, WR=${(result.winRate * 100).toFixed(1)}%, PnL=$${result.totalReturn.toFixed(2)}`
    );

    // Paper 결과도 기준 충족 체크
    if (!this.checkCriteria(result)) {
      this.log("⚠️ Paper trading results below criteria");
      this.state.bestResult = null; // 기준 미충족
    }
  }

  /**
   * Live 트레이딩 활성화
   */
  private enableLiveTrading(): void {
    this.state.liveEnabled = true;
    this.state.status = "live";
    this.log("🚀 LIVE TRADING ENABLED with optimized parameters");

    // 텔레그램 알림
    telegramService.notifyAlert({
      level: "info",
      title: "🚀 Live Trading Enabled",
      message: `${this.config.name} is now live with:
- Win Rate: ${((this.state.bestResult?.winRate || 0) * 100).toFixed(1)}%
- Profit Factor: ${this.state.bestResult?.profitFactor.toFixed(2)}
- Sharpe: ${this.state.bestResult?.sharpeRatio.toFixed(2)}`,
    });
  }

  /**
   * 승인 요청 알림
   */
  private async notifyForApproval(): Promise<void> {
    this.log("📬 Sending approval request...");

    await telegramService.notifyAlert({
      level: "info",
      title: "Agent Ready for Approval",
      message: `${this.config.name} found optimal parameters:
- Win Rate: ${((this.state.bestResult?.winRate || 0) * 100).toFixed(1)}%
- Profit Factor: ${this.state.bestResult?.profitFactor.toFixed(2)}
- Max DD: ${this.state.bestResult?.maxDrawdownPercent.toFixed(1)}%

Approve at /agent/${this.config.name}/approve`,
    });
  }

  /**
   * 기준 충족 체크
   */
  private checkCriteria(result: BacktestResult): boolean {
    return (
      result.winRate >= this.config.minWinRate &&
      result.profitFactor >= this.config.minProfitFactor &&
      result.maxDrawdownPercent <= this.config.maxDrawdownPercent &&
      result.sharpeRatio >= this.config.minSharpeRatio
    );
  }

  /**
   * 복합 점수 계산
   */
  private calculateScore(result: BacktestResult): number {
    // 가중치 조합
    const winRateScore = result.winRate * 100 * 0.3;
    const pfScore = Math.min(result.profitFactor, 3) * 20 * 0.3;
    const sharpeScore = Math.min(result.sharpeRatio, 3) * 20 * 0.2;
    const ddPenalty = Math.max(0, result.maxDrawdownPercent - 10) * 2;

    return winRateScore + pfScore + sharpeScore - ddPenalty;
  }

  /**
   * 파라미터 변형 (Genetic Algorithm 스타일)
   */
  private mutateParams(
    base: Record<string, number>,
    round: number
  ): Record<string, number> {
    const mutated = { ...base };
    const mutationRate = Math.max(0.1, 0.5 - round * 0.01); // 점점 줄어드는 변형률

    for (const [key, range] of Object.entries(this.config.paramRanges || {})) {
      if (Math.random() < mutationRate) {
        const range2 = range as { min: number; max: number; step: number };
        const steps = Math.floor((range2.max - range2.min) / range2.step);
        const randomStep = Math.floor(Math.random() * steps);
        mutated[key] = range2.min + randomStep * range2.step;
      }
    }

    return mutated;
  }

  /**
   * 기본 파라미터
   */
  private getDefaultParams(): Record<string, number> {
    if (this.config.strategyType === "grid_bot") {
      return {
        upperPrice: 100000,
        lowerPrice: 90000,
        gridCount: 10,
        leverage: 3,
        stopLossPercent: 5,
      };
    } else {
      return {
        rsiOversold: 30,
        rsiOverbought: 70,
        stopLossPercent: 2,
        takeProfitPercent: 5,
        trailingStopPercent: 2,
        leverage: 3,
      };
    }
  }

  /**
   * 백테스트 설정 생성
   */
  private buildBacktestConfig(params: Record<string, number>): BacktestConfig {
    return {
      symbol: this.config.symbol,
      startDate: new Date(
        Date.now() - this.config.backtestDays * 24 * 60 * 60 * 1000
      ),
      endDate: new Date(),
      initialCapital: this.config.initialCapital,
      strategyType: this.config.strategyType,
      strategyParams: {
        symbol: this.config.symbol,
        totalCapital: this.config.initialCapital,
        ...params,
      } as any,
    };
  }

  /**
   * 로그 추가
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const log = `[${timestamp}] ${message}`;
    this.state.logs.push(log);
    console.log(`[${this.config.name}] ${message}`);

    // 최근 100개만 유지
    if (this.state.logs.length > 100) {
      this.state.logs = this.state.logs.slice(-100);
    }
  }

  // ============================================
  // Public API
  // ============================================

  stop(): void {
    this.stopRequested = true;
    this.log("⏹️ Stop requested");
  }

  approve(): void {
    if (this.state.bestResult && this.checkCriteria(this.state.bestResult)) {
      this.enableLiveTrading();
    } else {
      this.log("❌ Cannot approve: criteria not met");
    }
  }

  pause(): void {
    this.state.liveEnabled = false;
    this.state.status = "paused";
    this.log("⏸️ Agent paused");
  }

  resume(): void {
    if (this.state.bestResult) {
      this.state.liveEnabled = true;
      this.state.status = "live";
      this.log("▶️ Agent resumed");
    }
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  getBestParams(): Record<string, number> {
    return { ...this.state.bestParams };
  }
}

// ============================================
// 에이전트 매니저
// ============================================

class AgentManager {
  private agents: Map<string, TradingAgent> = new Map();

  create(config: AgentConfig): TradingAgent {
    const agent = new TradingAgent(config);
    this.agents.set(config.name, agent);
    console.log(`🤖 Agent created: ${config.name}`);
    return agent;
  }

  get(name: string): TradingAgent | undefined {
    return this.agents.get(name);
  }

  getAll(): TradingAgent[] {
    return Array.from(this.agents.values());
  }

  remove(name: string): boolean {
    const agent = this.agents.get(name);
    if (agent) {
      agent.stop();
      this.agents.delete(name);
      return true;
    }
    return false;
  }

  listNames(): string[] {
    return Array.from(this.agents.keys());
  }
}

export const agentManager = new AgentManager();
