// src/modules/backtest/backtest.service.ts
import { indicatorService } from "../market/indicator.service";
import { createGridBot, type GridConfig } from "../strategy/grid-bot.service";
import {
  createMomentumStrategy,
  type MomentumConfig,
} from "../strategy/momentum.service";

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestConfig {
  initialCapital: number;
  strategyType: "grid_bot" | "momentum";
  strategyParams: any; // Allow any for flexibility in backtest configs
  symbol: string;
  days: number;
  startDate?: Date;
  endDate?: Date;
}

export interface BacktestResult {
  config: BacktestConfig;
  startBalance: number;
  endBalance: number;
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  sharpeRatio: number;
  trades: Array<{
    entryTime: number;
    exitTime: number;
    side: "long" | "short" | "grid_buy" | "grid_sell";
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
  }>;
  equityCurve: Array<{ timestamp: number; equity: number }>;
}

export function generateSampleCandles(
  days: number,
  startPrice: number = 40000
): CandleData[] {
  const candles: CandleData[] = [];
  const now = Date.now();
  let currentPrice = startPrice;
  const minutes = days * 24 * 60;

  for (let i = 0; i < minutes; i++) {
    const change = (Math.random() - 0.5) * 20;
    const open = currentPrice;
    const high = open + Math.random() * 10;
    const low = open - Math.random() * 10;
    const close = open + change;

    candles.push({
      timestamp: now - (minutes - i) * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: Math.random() * 10,
    });
    currentPrice = close;
  }

  return candles;
}

export class BacktestEngine {
  constructor(
    private config: BacktestConfig,
    private candles: CandleData[]
  ) {}

  async run(): Promise<BacktestResult> {
    const equityCurve: Array<{ timestamp: number; equity: number }> = [];
    const trades: BacktestResult["trades"] = [];

    if (this.config.strategyType === "grid_bot") {
      return this.runGridBot(equityCurve, trades);
    } else {
      return this.runMomentum(equityCurve, trades);
    }
  }

  private async runGridBot(
    equityCurve: Array<{ timestamp: number; equity: number }>,
    trades: BacktestResult["trades"]
  ): Promise<BacktestResult> {
    const strategy = createGridBot(this.config.strategyParams as GridConfig);
    strategy.initializeGrids();

    let balance = this.config.initialCapital;
    let peakBalance = balance;
    let maxDrawdown = 0;

    for (const candle of this.candles) {
      const result = strategy.onPriceUpdate(candle.close);

      // Grid Bot은 체결된 주문들을 통해 PnL 계산
      for (const order of result.executedOrders) {
        // 실제 PnL은 매수/매도 짝이 맞아야 하지만 백테스트에서는 단순화하여 기록
        // (Grid Bot은 보통 실시간 잔고를 관리하므로 여기서는 주문 체결 자체를 기록)
        trades.push({
          entryTime: candle.timestamp,
          exitTime: candle.timestamp,
          side: order.side === "buy" ? "grid_buy" : "grid_sell",
          entryPrice: order.price,
          exitPrice: order.price,
          pnl: 0, // 그리드 간 차익을 계산해야 함 (단순화)
          pnlPercent: 0,
        });
      }

      peakBalance = Math.max(peakBalance, balance);
      maxDrawdown = Math.max(
        maxDrawdown,
        (peakBalance - balance) / (peakBalance || 1)
      );
      equityCurve.push({ timestamp: candle.timestamp, equity: balance });
    }

    return this.calculateResults(balance, maxDrawdown, trades, equityCurve);
  }

  private async runMomentum(
    equityCurve: Array<{ timestamp: number; equity: number }>,
    trades: BacktestResult["trades"]
  ): Promise<BacktestResult> {
    const strategy = createMomentumStrategy(
      this.config.strategyParams as MomentumConfig
    );
    await strategy.start();

    let balance = this.config.initialCapital;
    let peakBalance = balance;
    let maxDrawdown = 0;

    const lookback = 100;

    for (let i = lookback; i < this.candles.length; i++) {
      const candle = this.candles[i];
      const recent = this.candles.slice(i - lookback, i);

      const indicators = indicatorService.calculateSnapshot(
        recent,
        candle.close
      );
      if (!indicators) continue;

      const position = strategy.getCurrentPosition();
      if (!position) {
        const signal = strategy.generateSignal(indicators, candle.close);
        if (signal.direction !== "none" && signal.confidence >= 0.6) {
          strategy.openPosition(signal);
        }
      } else {
        // 백테스트 시 onPriceUpdate 내부의 DB 조회를 피하기 위해
        // 직접 조건 체크 (strategy logic과 동일하게)
        const result = await strategy.onPriceUpdate(candle.close);

        if (result.action === "tp" || result.action === "sl") {
          const pnl = result.closedPnl || 0;
          balance += pnl;

          trades.push({
            entryTime: position.startTime,
            exitTime: candle.timestamp,
            side: position.direction,
            entryPrice: position.entryPrice,
            exitPrice: candle.close,
            pnl,
            pnlPercent: (pnl / this.config.initialCapital) * 100,
          });
        }
      }

      peakBalance = Math.max(peakBalance, balance);
      maxDrawdown = Math.max(
        maxDrawdown,
        (peakBalance - balance) / (peakBalance || 1)
      );
      equityCurve.push({ timestamp: candle.timestamp, equity: balance });
    }

    return this.calculateResults(balance, maxDrawdown, trades, equityCurve);
  }

  private calculateResults(
    endBalance: number,
    maxDrawdown: number,
    trades: BacktestResult["trades"],
    equityCurve: Array<{ timestamp: number; equity: number }>
  ): BacktestResult {
    const totalReturn = endBalance - this.config.initialCapital;
    const totalReturnPercent = (totalReturn / this.config.initialCapital) * 100;

    const winTrades = trades.filter((t) => t.pnl > 0);
    const lossTrades = trades.filter((t) => t.pnl <= 0);

    const winCount = winTrades.length;
    const lossCount = lossTrades.length;
    const winRate = (winCount / (trades.length || 1)) * 100;

    const totalWin = winTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(lossTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalWin / (totalLoss || 1);

    return {
      config: this.config,
      startBalance: this.config.initialCapital,
      endBalance,
      totalReturn,
      totalReturnPercent,
      maxDrawdown: maxDrawdown * this.config.initialCapital,
      maxDrawdownPercent: maxDrawdown * 100,
      totalTrades: trades.length,
      winCount,
      lossCount,
      winRate,
      profitFactor,
      averageWin: totalWin / (winCount || 1),
      averageLoss: totalLoss / (lossCount || 1),
      sharpeRatio: totalReturnPercent / (maxDrawdown * 100 || 1),
      trades,
      equityCurve,
    };
  }
}

export async function runBacktest(
  config: BacktestConfig,
  candles: CandleData[]
): Promise<BacktestResult> {
  const engine = new BacktestEngine(config, candles);
  return await engine.run();
}
