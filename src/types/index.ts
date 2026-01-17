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
  winTrades?: number; // 추가
  lossTrades?: number; // 추가
}

export interface TradeResult {
  action: "long" | "short" | "close" | "none";
  price: number;
  size?: number;
  pnl?: number;
  reason?: string;
}

export interface TradingStrategy {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  onPriceUpdate(currentPrice: number): any | Promise<any>;
  getStats(): StrategyStats;
  getConfig(): any;
  initializeGrids?(): any;
}
