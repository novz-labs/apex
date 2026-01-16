// src/modules/websocket/hyperliquid-ws.service.ts

import { getSubscriptionClient } from "../exchange/hyperliquid.client";

// ============================================
// 타입 정의
// ============================================

interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
}

interface OrderBookLevel {
  price: string;
  size: string;
  count: number;
}

interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

type PriceCallback = (data: PriceData) => void;
type OrderBookCallback = (data: OrderBookData) => void;

// ============================================
// WebSocket 서비스
// ============================================

class HyperliquidWebSocketService {
  private priceCallbacks: Map<string, Set<PriceCallback>> = new Map();
  private orderBookCallbacks: Map<string, Set<OrderBookCallback>> = new Map();
  private prices: Map<string, PriceData> = new Map();
  private orderBooks: Map<string, OrderBookData> = new Map();
  private isConnected = false;
  private subscriptions: Set<string> = new Set();

  /**
   * 가격 구독
   */
  subscribePrice(symbol: string, callback: PriceCallback): () => void {
    if (!this.priceCallbacks.has(symbol)) {
      this.priceCallbacks.set(symbol, new Set());
    }

    this.priceCallbacks.get(symbol)!.add(callback);

    // 첫 구독이면 WebSocket 구독 시작
    if (!this.subscriptions.has(`price:${symbol}`)) {
      this.startPriceSubscription(symbol);
    }

    // 구독 해제 함수 반환
    return () => {
      const callbacks = this.priceCallbacks.get(symbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.priceCallbacks.delete(symbol);
          this.subscriptions.delete(`price:${symbol}`);
        }
      }
    };
  }

  /**
   * 오더북 구독
   */
  subscribeOrderBook(symbol: string, callback: OrderBookCallback): () => void {
    if (!this.orderBookCallbacks.has(symbol)) {
      this.orderBookCallbacks.set(symbol, new Set());
    }

    this.orderBookCallbacks.get(symbol)!.add(callback);

    if (!this.subscriptions.has(`orderbook:${symbol}`)) {
      this.startOrderBookSubscription(symbol);
    }

    return () => {
      const callbacks = this.orderBookCallbacks.get(symbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.orderBookCallbacks.delete(symbol);
          this.subscriptions.delete(`orderbook:${symbol}`);
        }
      }
    };
  }

  /**
   * 가격 구독 시작
   */
  private async startPriceSubscription(symbol: string): Promise<void> {
    try {
      const client = getSubscriptionClient();
      this.subscriptions.add(`price:${symbol}`);

      await client.subscribe({ type: "allMids" }, (data) => {
        // allMids 응답에서 해당 심볼의 가격 추출
        const mids = data as Record<string, string>;
        const priceStr = mids[symbol];

        if (priceStr) {
          const priceData: PriceData = {
            symbol,
            price: parseFloat(priceStr),
            timestamp: Date.now(),
          };

          this.prices.set(symbol, priceData);
          this.notifyPriceSubscribers(symbol, priceData);
        }
      });

      this.isConnected = true;
      console.log(`📡 Subscribed to price: ${symbol}`);
    } catch (error) {
      console.error(`❌ Price subscription failed for ${symbol}:`, error);
      this.subscriptions.delete(`price:${symbol}`);
    }
  }

  /**
   * 오더북 구독 시작
   */
  private async startOrderBookSubscription(symbol: string): Promise<void> {
    try {
      const client = getSubscriptionClient();
      this.subscriptions.add(`orderbook:${symbol}`);

      await client.subscribe({ type: "l2Book", coin: symbol }, (data) => {
        const bookData = data as {
          coin: string;
          levels: [
            [
              { px: string; sz: string; n: number }[],
              { px: string; sz: string; n: number }[],
            ],
          ];
        };

        const orderBookData: OrderBookData = {
          symbol: bookData.coin,
          bids: bookData.levels[0][0].map((l) => ({
            price: l.px,
            size: l.sz,
            count: l.n,
          })),
          asks: bookData.levels[0][1].map((l) => ({
            price: l.px,
            size: l.sz,
            count: l.n,
          })),
          timestamp: Date.now(),
        };

        this.orderBooks.set(symbol, orderBookData);
        this.notifyOrderBookSubscribers(symbol, orderBookData);
      });

      console.log(`📡 Subscribed to orderbook: ${symbol}`);
    } catch (error) {
      console.error(`❌ OrderBook subscription failed for ${symbol}:`, error);
      this.subscriptions.delete(`orderbook:${symbol}`);
    }
  }

  /**
   * 가격 구독자에게 알림
   */
  private notifyPriceSubscribers(symbol: string, data: PriceData): void {
    const callbacks = this.priceCallbacks.get(symbol);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(data);
        } catch (error) {
          console.error("Price callback error:", error);
        }
      }
    }
  }

  /**
   * 오더북 구독자에게 알림
   */
  private notifyOrderBookSubscribers(
    symbol: string,
    data: OrderBookData
  ): void {
    const callbacks = this.orderBookCallbacks.get(symbol);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(data);
        } catch (error) {
          console.error("OrderBook callback error:", error);
        }
      }
    }
  }

  /**
   * 현재 가격 조회 (캐시)
   */
  getPrice(symbol: string): PriceData | null {
    return this.prices.get(symbol) || null;
  }

  /**
   * 모든 가격 조회
   */
  getAllPrices(): Record<string, PriceData> {
    const result: Record<string, PriceData> = {};
    for (const [symbol, data] of this.prices) {
      result[symbol] = data;
    }
    return result;
  }

  /**
   * 현재 오더북 조회 (캐시)
   */
  getOrderBook(symbol: string): OrderBookData | null {
    return this.orderBooks.get(symbol) || null;
  }

  /**
   * 상태 조회
   */
  getStatus(): {
    isConnected: boolean;
    subscriptions: string[];
    priceCount: number;
    orderBookCount: number;
  } {
    return {
      isConnected: this.isConnected,
      subscriptions: Array.from(this.subscriptions),
      priceCount: this.prices.size,
      orderBookCount: this.orderBooks.size,
    };
  }
}

export const hyperliquidWS = new HyperliquidWebSocketService();
