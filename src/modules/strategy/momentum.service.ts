// src/modules/strategy/momentum.service.ts
import { type StrategyStats, type TradingStrategy } from "../../types";
import { indicatorService } from "../market/indicator.service";

// ============================================
// 타입 정의
// ============================================

export interface MomentumConfig {
  symbol: string;
  days: number;
  leverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent?: number;
  totalCapital: number;
  rsiOversold?: number;
  rsiOverbought?: number;
  adxThreshold?: number;
  bbStdDev?: number;
}

export interface MomentumSignal {
  symbol: string;
  direction: "long" | "short" | "none";
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  confidence: number;
  indicators: IndicatorSnapshot;
  reason: string;
}

export interface IndicatorSnapshot {
  rsi: number;
  bbPosition: "above_upper" | "below_lower" | "within";
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  ema20: number;
  ema50: number;
  ema100: number;
  macdCrossover: "bullish" | "bearish" | "none";
  macdLine: number;
  signalLine: number;
  macdHistogram: number;
}

export interface MomentumPosition {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  size: number;
  tpPrice: number;
  slPrice: number;
  trailingStopPrice?: number;
  startTime: number;
  status: "open" | "closed";
  exitPrice?: number;
  exitTime?: number;
  pnl?: number;
  pnlPercent?: number;
}

export const DEFAULT_MOMENTUM_CONFIG: Partial<MomentumConfig> = {
  days: 30,
  leverage: 5,
  stopLossPercent: 2,
  takeProfitPercent: 5,
  totalCapital: 1000,
};

// ============================================
// Momentum 서비스
// ============================================

export class MomentumStrategy implements TradingStrategy {
  private currentPosition: MomentumPosition | null = null;
  private isRunning: boolean = false;
  private stats: StrategyStats = {
    totalTrades: 0,
    winTrades: 0,
    lossTrades: 0,
    totalPnL: 0,
    winRate: 0,
    isRunning: false,
  };

  private rsiOversold: number;
  private rsiOverbought: number;
  private adxThreshold: number;

  constructor(public config: MomentumConfig) {
    this.rsiOversold = config.rsiOversold ?? 30;
    this.rsiOverbought = config.rsiOverbought ?? 70;
    this.adxThreshold = config.adxThreshold ?? 25;
  }

  public getCurrentPosition(): MomentumPosition | null {
    return this.currentPosition;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.stats.isRunning = true;
    console.log(`[Momentum] Started for ${this.config.symbol}`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stats.isRunning = false;
    console.log(`[Momentum] Stopped for ${this.config.symbol}`);
  }

  async onPriceUpdate(currentPrice: number): Promise<{
    action: "hold" | "tp" | "sl" | "trailing_updated" | "open";
    position: MomentumPosition | null;
    closedPnl?: number;
    signal?: MomentumSignal;
  }> {
    if (!this.isRunning) {
      return { action: "hold", position: null };
    }

    if (!this.currentPosition) {
      const indicators = await indicatorService.getSnapshot(
        this.config.symbol,
        "1m",
        currentPrice
      );
      if (!indicators) return { action: "hold", position: null };

      const signal = this.generateSignal(indicators, currentPrice);
      if (signal.direction !== "none" && signal.confidence >= 0.6) {
        const position = this.openPosition(signal);
        return { action: "open", position, signal };
      }
      return { action: "hold", position: null };
    } else {
      const pos = this.currentPosition;
      if (
        (pos.direction === "long" && currentPrice >= pos.tpPrice) ||
        (pos.direction === "short" && currentPrice <= pos.tpPrice)
      ) {
        const closedPos = this.closePosition(currentPrice, "tp");
        return { action: "tp", position: closedPos, closedPnl: closedPos.pnl };
      }
      if (
        (pos.direction === "long" && currentPrice <= pos.slPrice) ||
        (pos.direction === "short" && currentPrice >= pos.slPrice)
      ) {
        const closedPos = this.closePosition(currentPrice, "sl");
        return { action: "sl", position: closedPos, closedPnl: closedPos.pnl };
      }
      if (this.config.trailingStopPercent && pos.trailingStopPrice) {
        if (pos.direction === "long") {
          const newTS =
            currentPrice * (1 - this.config.trailingStopPercent / 100);
          if (newTS > pos.trailingStopPrice) {
            pos.trailingStopPrice = newTS;
            return { action: "trailing_updated", position: pos };
          }
        } else {
          const newTS =
            currentPrice * (1 + this.config.trailingStopPercent / 100);
          if (newTS < pos.trailingStopPrice) {
            pos.trailingStopPrice = newTS;
            return { action: "trailing_updated", position: pos };
          }
        }
      }
      return { action: "hold", position: pos };
    }
  }

  public generateSignal(
    indicators: IndicatorSnapshot,
    currentPrice: number
  ): MomentumSignal {
    let direction: "long" | "short" | "none" = "none";
    let confidence = 0;
    let reasons: string[] = [];
    const isBullishTrend =
      indicators.ema20 > indicators.ema50 &&
      indicators.ema50 > indicators.ema100;
    const isBearishTrend =
      indicators.ema20 < indicators.ema50 &&
      indicators.ema50 < indicators.ema100;
    const isStrongTrend = indicators.adx > this.adxThreshold;
    const isBullishMAC = indicators.macdCrossover === "bullish";
    const isBearishMAC = indicators.macdCrossover === "bearish";

    if (
      isBullishTrend &&
      isStrongTrend &&
      indicators.rsi < 60 &&
      isBullishMAC
    ) {
      direction = "long";
      confidence = 0.8;
      reasons.push("Bullish");
    } else if (
      isBearishTrend &&
      isStrongTrend &&
      indicators.rsi > 40 &&
      isBearishMAC
    ) {
      direction = "short";
      confidence = 0.8;
      reasons.push("Bearish");
    }

    const tpDist = currentPrice * (this.config.takeProfitPercent / 100);
    const slDist = currentPrice * (this.config.stopLossPercent / 100);
    return {
      symbol: this.config.symbol,
      direction,
      entryPrice: currentPrice,
      tpPrice:
        direction === "long" ? currentPrice + tpDist : currentPrice - tpDist,
      slPrice:
        direction === "long" ? currentPrice - slDist : currentPrice + slDist,
      confidence,
      indicators,
      reason: reasons.join(", "),
    };
  }

  public openPosition(signal: MomentumSignal): MomentumPosition {
    const size =
      (this.config.totalCapital * this.config.leverage) / signal.entryPrice;
    this.currentPosition = {
      id: Math.random().toString(36).substring(7),
      symbol: signal.symbol,
      direction: signal.direction as any,
      entryPrice: signal.entryPrice,
      size,
      tpPrice: signal.tpPrice,
      slPrice: signal.slPrice,
      startTime: Date.now(),
      status: "open",
      trailingStopPrice: this.config.trailingStopPercent
        ? signal.direction === "long"
          ? signal.entryPrice * (1 - this.config.trailingStopPercent / 100)
          : signal.entryPrice * (1 + this.config.trailingStopPercent / 100)
        : undefined,
    };
    return this.currentPosition;
  }

  public closePosition(
    exitPrice: number,
    reason: "tp" | "sl"
  ): MomentumPosition {
    if (!this.currentPosition) throw new Error("No pos");
    const pos = this.currentPosition;
    pos.status = "closed";
    pos.exitPrice = exitPrice;
    pos.exitTime = Date.now();
    const pnl =
      pos.direction === "long"
        ? (exitPrice - pos.entryPrice) * pos.size
        : (pos.entryPrice - exitPrice) * pos.size;
    pos.pnl = pnl;
    pos.pnlPercent = (pnl / this.config.totalCapital) * 100;
    this.stats.totalTrades++;
    if (pnl > 0) this.stats.winTrades!++;
    else this.stats.lossTrades!++;
    this.stats.totalPnL! += pnl;
    this.stats.winRate = (this.stats.winTrades! / this.stats.totalTrades) * 100;
    this.currentPosition = null;
    return pos;
  }

  getStats(): StrategyStats {
    return this.stats;
  }
  getConfig(): MomentumConfig {
    return this.config;
  }
}

export function createMomentumStrategy(
  config: MomentumConfig
): MomentumStrategy {
  return new MomentumStrategy(config);
}
