// src/modules/market/market-loop.service.ts

import { executionService } from "../execution/execution.service";
import { strategyService } from "../strategy/strategy.service";
import { hyperliquidWS } from "../websocket/hyperliquid-ws.service";

// ============================================
// 타입 정의
// ============================================

interface MarketLoopConfig {
  enabled: boolean;
  updateIntervalMs: number; // 최소 업데이트 간격 (throttle)
}

interface SymbolSubscription {
  symbol: string;
  strategyIds: string[];
  lastUpdate: number;
  unsubscribe?: () => void;
}

// ============================================
// Market Loop Service
// ============================================

class MarketLoopService {
  private config: MarketLoopConfig = {
    enabled: false,
    updateIntervalMs: 1000, // 1초 간격
  };

  private subscriptions = new Map<string, SymbolSubscription>();
  private isRunning = false;

  /**
   * 마켓 루프 시작
   */
  start(): void {
    if (this.isRunning) {
      console.warn("⚠️ MarketLoop already running");
      return;
    }

    this.config.enabled = true;
    this.isRunning = true;

    const mode = executionService.isPaperMode() ? "📝 PAPER" : "🔴 LIVE";
    console.log(`🔄 MarketLoop started (${mode} MODE)`);
    this.syncSubscriptions();
  }

  /**
   * 마켓 루프 중지
   */
  stop(): void {
    this.config.enabled = false;
    this.isRunning = false;

    // 모든 구독 해제
    for (const [symbol, sub] of this.subscriptions) {
      if (sub.unsubscribe) {
        sub.unsubscribe();
      }
    }
    this.subscriptions.clear();

    console.log("🛑 MarketLoop stopped");
  }

  /**
   * 활성 전략의 심볼에 맞게 구독 동기화
   */
  syncSubscriptions(): void {
    const strategies = strategyService.getAllStrategies();
    const enabledStrategies = strategies.filter((s) => s.enabled);

    // 심볼별 전략 매핑
    const symbolToStrategies = new Map<string, string[]>();

    for (const strategy of enabledStrategies) {
      const config = strategy.strategy.getConfig();
      const symbol = config.symbol;

      if (!symbolToStrategies.has(symbol)) {
        symbolToStrategies.set(symbol, []);
      }
      symbolToStrategies.get(symbol)!.push(strategy.id);
    }

    // 새 심볼 구독
    for (const [symbol, strategyIds] of symbolToStrategies) {
      if (!this.subscriptions.has(symbol)) {
        this.subscribeToSymbol(symbol, strategyIds);
      } else {
        // 전략 ID 업데이트
        this.subscriptions.get(symbol)!.strategyIds = strategyIds;
      }
    }

    // 더 이상 필요 없는 심볼 구독 해제
    for (const [symbol, sub] of this.subscriptions) {
      if (!symbolToStrategies.has(symbol)) {
        if (sub.unsubscribe) {
          sub.unsubscribe();
        }
        this.subscriptions.delete(symbol);
        console.log(`📡 Unsubscribed from ${symbol}`);
      }
    }

    console.log(`📡 Synced subscriptions: ${this.subscriptions.size} symbols`);
  }

  /**
   * 심볼 구독 시작
   */
  private subscribeToSymbol(symbol: string, strategyIds: string[]): void {
    console.log(
      `📡 Subscribing to ${symbol} for strategies: ${strategyIds.join(", ")}`
    );

    const unsubscribe = hyperliquidWS.subscribePrice(symbol, (priceData) => {
      this.onPriceUpdate(symbol, priceData.price);
    });

    this.subscriptions.set(symbol, {
      symbol,
      strategyIds,
      lastUpdate: 0,
      unsubscribe,
    });
  }

  /**
   * 가격 업데이트 처리
   */
  private async onPriceUpdate(symbol: string, price: number): Promise<void> {
    if (!this.config.enabled) return;

    const sub = this.subscriptions.get(symbol);
    if (!sub) return;

    // Throttle 체크
    const now = Date.now();
    if (now - sub.lastUpdate < this.config.updateIntervalMs) {
      return;
    }
    sub.lastUpdate = now;

    // 해당 심볼의 전략들에게 가격 전달
    for (const strategyId of sub.strategyIds) {
      await this.processStrategyUpdate(strategyId, symbol, price);
    }
  }

  /**
   * 전략 업데이트 처리 및 액션 실행
   */
  private async processStrategyUpdate(
    strategyId: string,
    symbol: string,
    price: number
  ): Promise<void> {
    const instance = strategyService.getStrategy(strategyId);
    if (!instance || !instance.enabled) return;

    try {
      const result = instance.strategy.onPriceUpdate(price);

      // === GridBot 액션 처리 ===
      if (result.executedOrders && result.executedOrders.length > 0) {
        for (const order of result.executedOrders) {
          await executionService.executeOrder({
            symbol,
            side: order.side,
            size: order.size,
            price: order.price,
            strategyId,
            reason: `Grid ${order.side} @ ${order.price}`,
          });
        }
      }

      // GridBot StopLoss
      if (result.stopLossTriggered) {
        console.log(`🚨 [${strategyId}] GridBot StopLoss triggered!`);
        await strategyService.toggleStrategy(strategyId, false);
      }

      // === Momentum/Scalping TP/SL 처리 ===
      if (
        result.action &&
        result.action !== "hold" &&
        result.action !== "none" &&
        result.action !== "updated"
      ) {
        if (result.action === "tp" || result.action === "sl") {
          console.log(
            `📤 [${strategyId}] Position closed: ${result.action.toUpperCase()}, PnL: $${result.closedPnl?.toFixed(2) ?? 0}`
          );
          // 여기서 ExecutionService로 실제 청산 주문 전송 가능
        }
      }

      // === FundingArb 포지션 업데이트 ===
      if (result.positions && Array.isArray(result.positions)) {
        // FundingArb는 가격 업데이트 시 포지션만 업데이트되고
        // 실제 종료는 별도의 로직(펀딩 수령 후 조건 체크)에서 처리
        // 여기서는 로깅만
        if (result.positions.length > 0) {
          const totalPnl = result.positions.reduce(
            (sum: number, p: any) => sum + (p.totalPnl || 0),
            0
          );
          // 주기적으로 로깅 (너무 자주 하지 않도록)
          if (Math.random() < 0.01) {
            // 1% 확률로 로깅
            console.log(
              `💰 [FundingArb] ${result.positions.length} positions, Total PnL: $${totalPnl.toFixed(4)}`
            );
          }
        }
      }
    } catch (error) {
      console.error(`❌ [MarketLoop] Error processing ${strategyId}:`, error);
    }
  }

  /**
   * 수동 가격 업데이트 (테스트용)
   */
  async manualPriceUpdate(symbol: string, price: number): Promise<void> {
    await this.onPriceUpdate(symbol, price);
  }

  /**
   * 상태 조회
   */
  getStatus(): {
    isRunning: boolean;
    subscriptions: Array<{ symbol: string; strategyCount: number }>;
  } {
    return {
      isRunning: this.isRunning,
      subscriptions: Array.from(this.subscriptions.values()).map((sub) => ({
        symbol: sub.symbol,
        strategyCount: sub.strategyIds.length,
      })),
    };
  }

  /**
   * 설정 변경
   */
  configure(config: Partial<MarketLoopConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(
      `⚙️ MarketLoop configured: updateInterval=${this.config.updateIntervalMs}ms`
    );
  }
}

export const marketLoopService = new MarketLoopService();
