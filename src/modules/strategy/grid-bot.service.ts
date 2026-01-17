// src/modules/strategy/grid-bot.service.ts

// ============================================
// 타입 정의
// ============================================

export interface GridConfig {
  symbol: string;
  upperPrice: number;
  lowerPrice: number;
  gridCount: number; // 그리드 수 (10-20)
  totalCapital: number; // 투입 자본 (USD)
  leverage: number; // 1-5x
  stopLossPercent: number; // 전체 손절 %
}

export interface GridOrder {
  id: string;
  price: number;
  side: "buy" | "sell";
  size: number;
  status: "pending" | "filled" | "cancelled";
  filledAt?: Date;
  pnl?: number;
}

export interface GridStats {
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  filledBuys: number;
  filledSells: number;
  activeGrids: number;
  winRate: number;
  isRunning: boolean;
}

// ============================================
// Grid Bot 전략 클래스
// ============================================

export class GridBotStrategy {
  private config: GridConfig;
  private grids: GridOrder[] = [];
  private filledBuys: number = 0;
  private filledSells: number = 0;
  private realizedPnL: number = 0;
  private unrealizedPnL: number = 0;
  private isRunning: boolean = false;
  private lastPrice: number = 0;
  private entryPrices: number[] = [];

  constructor(config: GridConfig) {
    this.config = config;
    this.validateConfig();
  }

  // ============================================
  // 설정 검증
  // ============================================

  private validateConfig(): void {
    const { upperPrice, lowerPrice, gridCount, leverage, stopLossPercent } =
      this.config;

    if (upperPrice <= lowerPrice) {
      throw new Error("upperPrice must be greater than lowerPrice");
    }

    if (gridCount < 5 || gridCount > 50) {
      throw new Error("gridCount must be between 5 and 50");
    }

    if (leverage < 1 || leverage > 10) {
      throw new Error("leverage must be between 1 and 10");
    }

    if (stopLossPercent < 1 || stopLossPercent > 20) {
      throw new Error("stopLossPercent must be between 1 and 20");
    }
  }

  // ============================================
  // 그리드 초기화
  // ============================================

  initializeGrids(currentPrice?: number): GridOrder[] {
    const { upperPrice, lowerPrice, gridCount, totalCapital, leverage } =
      this.config;

    const gridSpacing = (upperPrice - lowerPrice) / gridCount;
    const sizePerGrid = (totalCapital * leverage) / gridCount;

    this.grids = [];

    for (let i = 0; i <= gridCount; i++) {
      const price = lowerPrice + gridSpacing * i;

      const side = currentPrice && price > currentPrice ? "sell" : "buy";

      this.grids.push({
        id: `grid_${i}_${Date.now()}`,
        price,
        side,
        size: sizePerGrid / price,
        status: "pending",
      });
    }

    this.isRunning = true;

    console.log(
      `📊 Grid initialized: ${gridCount} levels from $${lowerPrice.toFixed(2)} to $${upperPrice.toFixed(2)}`,
    );
    console.log(`💰 Size per grid: $${sizePerGrid.toFixed(2)}`);

    return [...this.grids];
  }

  // ============================================
  // 가격 업데이트 처리
  // ============================================

  onPriceUpdate(currentPrice: number): {
    executedOrders: GridOrder[];
    shouldRebalance: boolean;
    stopLossTriggered: boolean;
  } {
    if (!this.isRunning) {
      return {
        executedOrders: [],
        shouldRebalance: false,
        stopLossTriggered: false,
      };
    }

    this.lastPrice = currentPrice;
    const executedOrders: GridOrder[] = [];

    // 미실현 PnL 계산
    this.calculateUnrealizedPnL(currentPrice);

    // Stop Loss 체크
    const stopLossTriggered = this.checkStopLoss();
    if (stopLossTriggered) {
      this.stop();
      return {
        executedOrders: [],
        shouldRebalance: false,
        stopLossTriggered: true,
      };
    }

    for (const grid of this.grids) {
      if (grid.status !== "pending") continue;

      // 매수 조건: 가격이 그리드 레벨 아래로 내려감
      if (grid.side === "buy" && currentPrice <= grid.price) {
        grid.status = "filled";
        grid.filledAt = new Date();
        this.filledBuys++;
        this.entryPrices.push(grid.price);

        // 매수 후 해당 레벨 위에 매도 주문 생성
        const gridSpacing =
          (this.config.upperPrice - this.config.lowerPrice) /
          this.config.gridCount;
        const sellPrice = grid.price + gridSpacing;

        this.grids.push({
          id: `sell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          price: sellPrice,
          side: "sell",
          size: grid.size,
          status: "pending",
        });

        executedOrders.push({ ...grid });
        console.log(`🟢 Grid BUY filled @ $${grid.price.toFixed(2)}`);
      }

      // 매도 조건: 가격이 그리드 레벨 위로 올라감
      if (grid.side === "sell" && currentPrice >= grid.price) {
        grid.status = "filled";
        grid.filledAt = new Date();
        this.filledSells++;

        // 수익 계산
        const gridSpacing =
          (this.config.upperPrice - this.config.lowerPrice) /
          this.config.gridCount;
        const buyPrice = grid.price - gridSpacing;
        const profit = grid.size * (grid.price - buyPrice);

        grid.pnl = profit;
        this.realizedPnL += profit;

        // 엔트리 가격에서 제거
        const entryIndex = this.entryPrices.findIndex(
          (p) => Math.abs(p - buyPrice) < 0.01,
        );
        if (entryIndex !== -1) {
          this.entryPrices.splice(entryIndex, 1);
        }

        // 매도 후 해당 레벨 아래에 매수 주문 생성
        this.grids.push({
          id: `buy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          price: buyPrice,
          side: "buy",
          size: grid.size,
          status: "pending",
        });

        executedOrders.push({ ...grid });
        console.log(
          `🔴 Grid SELL filled @ $${grid.price.toFixed(2)} | Profit: $${profit.toFixed(2)}`,
        );
      }
    }

    // 오래된 주문 정리 (메모리 관리)
    this.cleanupOldOrders();

    return {
      executedOrders,
      shouldRebalance: this.shouldRebalance(currentPrice),
      stopLossTriggered: false,
    };
  }

  // ============================================
  // 리밸런스 체크
  // ============================================

  shouldRebalance(currentPrice: number): boolean {
    const { upperPrice, lowerPrice } = this.config;
    const range = upperPrice - lowerPrice;
    const threshold = range * 0.12; // 12% 범위 이탈 시 재조정

    return (
      currentPrice > upperPrice + threshold ||
      currentPrice < lowerPrice - threshold
    );
  }

  rebalance(newUpperPrice: number, newLowerPrice: number): GridOrder[] {
    console.log(
      `🔄 Rebalancing grid from $${newLowerPrice.toFixed(2)} to $${newUpperPrice.toFixed(2)}`,
    );

    // 기존 pending 주문 취소
    this.grids = this.grids.filter((g) => g.status !== "pending");

    // 새로운 설정으로 업데이트
    this.config.upperPrice = newUpperPrice;
    this.config.lowerPrice = newLowerPrice;

    // 그리드 재초기화
    return this.initializeGrids();
  }

  // ============================================
  // Stop Loss 체크
  // ============================================

  private checkStopLoss(): boolean {
    const totalPnL = this.realizedPnL + this.unrealizedPnL;
    const stopLossAmount =
      (this.config.totalCapital * this.config.stopLossPercent) / 100;

    return totalPnL < -stopLossAmount;
  }

  private calculateUnrealizedPnL(currentPrice: number): void {
    this.unrealizedPnL = 0;

    for (const entryPrice of this.entryPrices) {
      // 매수 포지션의 미실현 PnL
      const gridSize =
        (this.config.totalCapital * this.config.leverage) /
        this.config.gridCount /
        entryPrice;
      this.unrealizedPnL += gridSize * (currentPrice - entryPrice);
    }
  }

  // ============================================
  // 유틸리티
  // ============================================

  private cleanupOldOrders(): void {
    const maxOrders = this.config.gridCount * 3;
    const filledOrders = this.grids.filter((g) => g.status === "filled");

    if (filledOrders.length > maxOrders) {
      // 오래된 체결 주문 제거
      const toRemove = filledOrders.length - maxOrders;
      filledOrders
        .sort(
          (a, b) => (a.filledAt?.getTime() || 0) - (b.filledAt?.getTime() || 0),
        )
        .slice(0, toRemove)
        .forEach((order) => {
          const index = this.grids.findIndex((g) => g.id === order.id);
          if (index !== -1) {
            this.grids.splice(index, 1);
          }
        });
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log(
      `⏹️ Grid bot stopped. Total PnL: $${this.getTotalPnL().toFixed(2)}`,
    );
  }

  start(): void {
    if (this.grids.length === 0) {
      this.initializeGrids();
    } else {
      this.isRunning = true;
    }
    console.log(`▶️ Grid bot started`);
  }

  getTotalPnL(): number {
    return this.realizedPnL + this.unrealizedPnL;
  }

  getStats(): any {
    const totalTrades = this.filledBuys + this.filledSells;
    const winTrades = this.grids.filter(
      (g) => g.status === "filled" && g.pnl && g.pnl > 0,
    ).length;

    return {
      totalTrades,
      totalPnL: this.getTotalPnL(),
      pnl: this.getTotalPnL(),
      realizedPnL: this.realizedPnL,
      unrealizedPnL: this.unrealizedPnL,
      filledBuys: this.filledBuys,
      filledSells: this.filledSells,
      activeGrids: this.grids.filter((g) => g.status === "pending").length,
      winRate: totalTrades > 0 ? winTrades / totalTrades : 0,
      isRunning: this.isRunning,
    };
  }

  getConfig(): GridConfig {
    return { ...this.config };
  }

  getGrids(): GridOrder[] {
    return [...this.grids];
  }

  getPendingOrders(): GridOrder[] {
    return this.grids.filter((g) => g.status === "pending");
  }

  getGridSpacing(): number {
    return (
      (this.config.upperPrice - this.config.lowerPrice) / this.config.gridCount
    );
  }
}

// ============================================
// 팩토리 함수
// ============================================

export function createGridBot(config: GridConfig): GridBotStrategy {
  return new GridBotStrategy(config);
}
