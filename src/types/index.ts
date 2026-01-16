export type StrategyType = "grid_bot" | "momentum" | "scalping" | "funding_arb";

export interface StrategyStats {
  totalTrades: number;
  wins?: number;
  losses?: number;
  pnl?: number;
  pnlPercent?: number;
  isRunning: boolean;
  realizedPnL?: number;
  unrealizedPnL?: number;
  winRate?: number;
  totalPnL?: number;
}

export interface TradeResult {
  action: "long" | "short" | "close" | "none";
  price: number;
  size?: number;
  pnl?: number;
  reason?: string;
}

export interface TradingStrategy {
  start(): void;
  stop(): void;
  onPriceUpdate(currentPrice: number): any;
  getStats(): StrategyStats;
  getConfig(): any;
  initializeGrids?(): any;
}
