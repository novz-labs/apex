import { type StrategyStats, type TradingStrategy } from "../../types";

export interface FundingArbConfig {
  symbol: string;
  minFundingRate: number; // e.g. 0.01% per hour
  leverage: number;
  totalCapital: number;
}

export class FundingArbStrategy implements TradingStrategy {
  private config: FundingArbConfig;
  private isRunning: boolean = false;
  private stats: StrategyStats;

  constructor(config: FundingArbConfig) {
    this.config = config;
    this.stats = {
      totalTrades: 0,
      pnl: 0,
      isRunning: false,
    };
  }

  start() {
    this.isRunning = true;
    this.stats.isRunning = true;
    console.log(`💰 Funding Arb Strategy started for ${this.config.symbol}`);
  }

  stop() {
    this.isRunning = false;
    this.stats.isRunning = false;
    console.log(`🛑 Funding Arb Strategy stopped for ${this.config.symbol}`);
  }

  onPriceUpdate(currentPrice: number) {
    if (!this.isRunning) return { action: "none" };
    return { action: "none" };
  }

  getStats(): StrategyStats {
    return {
      ...this.stats,
      totalFundingCollected: 0,
    } as any;
  }

  getConfig() {
    return this.config;
  }
}
