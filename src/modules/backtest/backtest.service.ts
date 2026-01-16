// src/modules/backtest/backtest.service.ts

import { createGridBot, type GridConfig } from "../strategy/grid-bot.service";
import {
  createMomentumStrategy,
  type IndicatorSnapshot,
  type MomentumConfig,
} from "../strategy/momentum.service";

// ============================================
// 타입 정의
// ============================================

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestConfig {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategyType: "grid_bot" | "momentum";
  strategyParams: GridConfig | MomentumConfig;
}

export interface BacktestResult {
  config: BacktestConfig;
  startBalance: number;
  endBalance: number;
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  tradingDays: number;
  equityCurve: Array<{ timestamp: number; equity: number }>;
  trades: Array<{
    entryTime: number;
    exitTime: number;
    side: "long" | "short";
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    result: "win" | "loss";
  }>;
}

// ============================================
// 백테스팅 엔진
// ============================================

export class BacktestEngine {
  private candles: CandleData[] = [];
  private config: BacktestConfig;

  constructor(config: BacktestConfig, candles: CandleData[]) {
    this.config = config;
    this.candles = candles;
  }

  /**
   * 백테스트 실행
   */
  run(): BacktestResult {
    const equityCurve: Array<{ timestamp: number; equity: number }> = [];
    const trades: BacktestResult["trades"] = [];

    let balance = this.config.initialCapital;
    let peakBalance = balance;
    let maxDrawdown = 0;

    if (this.config.strategyType === "grid_bot") {
      return this.runGridBot(equityCurve, trades);
    } else {
      return this.runMomentum(equityCurve, trades);
    }
  }

  /**
   * Grid Bot 백테스트
   */
  private runGridBot(
    equityCurve: Array<{ timestamp: number; equity: number }>,
    trades: BacktestResult["trades"]
  ): BacktestResult {
    const strategy = createGridBot(this.config.strategyParams as GridConfig);
    strategy.initializeGrids();

    let balance = this.config.initialCapital;
    let peakBalance = balance;
    let maxDrawdown = 0;

    for (const candle of this.candles) {
      const result = strategy.onPriceUpdate(candle.close);

      // 체결된 주문 기록
      for (const order of result.executedOrders) {
        if (order.side === "sell" && order.pnl) {
          balance += order.pnl;

          trades.push({
            entryTime: candle.timestamp - 60000, // 1분 전 (추정)
            exitTime: candle.timestamp,
            side: "long", // Grid는 기본적으로 Long
            entryPrice:
              order.price -
              (this.config.strategyParams as GridConfig).upperPrice /
                (this.config.strategyParams as GridConfig).gridCount,
            exitPrice: order.price,
            pnl: order.pnl,
            result: order.pnl > 0 ? "win" : "loss",
          });
        }
      }

      // 피크 및 드로다운 업데이트
      if (balance > peakBalance) {
        peakBalance = balance;
      }
      const drawdown = ((peakBalance - balance) / peakBalance) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      equityCurve.push({
        timestamp: candle.timestamp,
        equity: balance,
      });

      // Stop Loss 체크
      if (result.stopLossTriggered) {
        break;
      }
    }

    return this.generateResult(balance, maxDrawdown, equityCurve, trades);
  }

  /**
   * Momentum 백테스트
   */
  private runMomentum(
    equityCurve: Array<{ timestamp: number; equity: number }>,
    trades: BacktestResult["trades"]
  ): BacktestResult {
    const strategy = createMomentumStrategy(
      this.config.strategyParams as MomentumConfig
    );
    strategy.start();

    let balance = this.config.initialCapital;
    let peakBalance = balance;
    let maxDrawdown = 0;

    // RSI, BB 등을 계산하기 위해 최소 100개 캔들 필요
    const lookback = 100;
    const rsiPeriod = 14;
    const bbPeriod = 20;

    for (let i = lookback; i < this.candles.length; i++) {
      const candle = this.candles[i];
      const recent = this.candles.slice(i - lookback, i);

      // 간단한 지표 계산
      const indicators = this.calculateIndicators(recent);

      // 포지션이 없으면 시그널 생성 후 진입 시도
      const position = strategy.getCurrentPosition();
      if (!position) {
        const signal = strategy.generateSignal(indicators, candle.close);
        if (signal.direction !== "none") {
          strategy.openPosition(signal);
        }
      } else {
        // 포지션이 있으면 가격 업데이트
        const result = strategy.onPriceUpdate(candle.close);

        if (result.action === "tp" || result.action === "sl") {
          balance += result.closedPnl || 0;

          trades.push({
            entryTime: this.candles[i - 1].timestamp,
            exitTime: candle.timestamp,
            side: position.direction,
            entryPrice: position.entryPrice,
            exitPrice: candle.close,
            pnl: result.closedPnl || 0,
            result: (result.closedPnl || 0) > 0 ? "win" : "loss",
          });
        }
      }

      // 피크 및 드로다운
      if (balance > peakBalance) {
        peakBalance = balance;
      }
      const drawdown = ((peakBalance - balance) / peakBalance) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      equityCurve.push({
        timestamp: candle.timestamp,
        equity: balance,
      });
    }

    return this.generateResult(balance, maxDrawdown, equityCurve, trades);
  }

  /**
   * 지표 계산 (간단 버전)
   */
  private calculateIndicators(candles: CandleData[]): IndicatorSnapshot {
    const closes = candles.map((c) => c.close);
    const len = closes.length;

    // RSI 계산 (간단 버전)
    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.filter((c) => c > 0);
    const losses = changes.filter((c) => c < 0).map((c) => Math.abs(c));
    const avgGain =
      gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
    const avgLoss =
      losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 0.001;
    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    // SMA 계산
    const sma = (period: number) => {
      const slice = closes.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
    };

    const ema20 = sma(20);
    const ema50 = sma(50);
    const ema100 = len >= 100 ? sma(100) : sma(len);

    // BB 계산
    const sma20 = sma(20);
    const slice20 = closes.slice(-20);
    const variance =
      slice20.reduce((sum, c) => sum + Math.pow(c - sma20, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    const bbUpper = sma20 + 2 * stdDev;
    const bbLower = sma20 - 2 * stdDev;

    const currentPrice = closes[len - 1];
    let bbPosition: "above_upper" | "below_lower" | "within" = "within";
    if (currentPrice > bbUpper) bbPosition = "above_upper";
    else if (currentPrice < bbLower) bbPosition = "below_lower";

    return {
      rsi,
      bbPosition,
      bbUpper,
      bbMiddle: sma20,
      bbLower,
      adx: 25, // 단순화: 고정값
      plusDI: rsi > 50 ? 30 : 20,
      minusDI: rsi > 50 ? 20 : 30,
      ema20,
      ema50,
      ema100,
      macdCrossover: "none",
      macdLine: 0,
      signalLine: 0,
      macdHistogram: 0,
    };
  }

  /**
   * 결과 생성
   */
  private generateResult(
    endBalance: number,
    maxDrawdown: number,
    equityCurve: Array<{ timestamp: number; equity: number }>,
    trades: BacktestResult["trades"]
  ): BacktestResult {
    const wins = trades.filter((t) => t.result === "win");
    const losses = trades.filter((t) => t.result === "loss");

    const totalWin = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;

    // 일별 수익률 계산 (Sharpe 용)
    const dailyReturns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const ret =
        (equityCurve[i].equity - equityCurve[i - 1].equity) /
        equityCurve[i - 1].equity;
      dailyReturns.push(ret);
    }

    const avgReturn =
      dailyReturns.length > 0
        ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
        : 0;
    const variance =
      dailyReturns.length > 0
        ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
          dailyReturns.length
        : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn * Math.sqrt(252)) / stdDev : 0;

    const totalReturn = endBalance - this.config.initialCapital;

    return {
      config: this.config,
      startBalance: this.config.initialCapital,
      endBalance,
      totalReturn,
      totalReturnPercent: (totalReturn / this.config.initialCapital) * 100,
      maxDrawdown: (maxDrawdown * this.config.initialCapital) / 100,
      maxDrawdownPercent: maxDrawdown,
      sharpeRatio,
      totalTrades: trades.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      profitFactor:
        totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin: wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0,
      largestLoss:
        losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0,
      tradingDays: Math.ceil(
        (this.config.endDate.getTime() - this.config.startDate.getTime()) /
          (24 * 60 * 60 * 1000)
      ),
      equityCurve,
      trades,
    };
  }
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 백테스트 실행 함수
 */
export function runBacktest(
  config: BacktestConfig,
  candles: CandleData[]
): BacktestResult {
  const engine = new BacktestEngine(config, candles);
  return engine.run();
}

/**
 * 샘플 캔들 데이터 생성 (테스트용)
 */
export function generateSampleCandles(
  days: number,
  startPrice: number = 95000
): CandleData[] {
  const candles: CandleData[] = [];
  let price = startPrice;
  const now = Date.now();
  const oneMinute = 60 * 1000;

  for (let i = days * 24 * 60; i >= 0; i--) {
    const volatility = (Math.random() - 0.48) * 0.005; // 약간의 상승 편향
    const change = price * volatility;

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * Math.abs(change) * 0.5;
    const low = Math.min(open, close) - Math.random() * Math.abs(change) * 0.5;
    const volume = Math.random() * 100 + 10;

    candles.push({
      timestamp: now - i * oneMinute,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return candles;
}
