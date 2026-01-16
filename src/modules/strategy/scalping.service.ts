import { type StrategyStats, type TradingStrategy } from "../../types";

export interface ScalpingConfig {
  symbol: string;
  leverage: number;
  totalCapital: number;
  rsiOversold: number;
  rsiOverbought: number;
  stochKThreshold: number;
  stopLossPercent: number;
  takeProfitPercent: number;
}

export class ScalpingStrategy implements TradingStrategy {
  private config: ScalpingConfig;
  private isRunning: boolean = false;
  private stats: StrategyStats;

  constructor(config: ScalpingConfig) {
    this.config = config;
    this.stats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      pnl: 0,
      isRunning: false,
    };
  }

  start() {
    this.isRunning = true;
    this.stats.isRunning = true;
    console.log(`⚡ Scalping Strategy started for ${this.config.symbol}`);
  }

  stop() {
    this.isRunning = false;
    this.stats.isRunning = false;
    console.log(`🛑 Scalping Strategy stopped for ${this.config.symbol}`);
  }

  onPriceUpdate(currentPrice: number) {
    if (!this.isRunning) return { action: "none" };

    // Scalping logic would go here
    // For now, return a placeholder
    return {
      action: "none",
      currentPrice,
    };
  }

  getStats() {
    return this.stats;
  }

  getConfig() {
    return this.config;
  }
}
