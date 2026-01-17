// src/modules/websocket/binance-ws.service.ts

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
}

interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

interface MarkPriceData {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
}

type PriceCallback = (data: PriceData) => void;
type OrderBookCallback = (data: OrderBookData) => void;
type MarkPriceCallback = (data: MarkPriceData) => void;

// ============================================
// Binance WebSocket Service
// ============================================

class BinanceWebSocketService {
  private priceCallbacks: Map<string, Set<PriceCallback>> = new Map();
  private orderBookCallbacks: Map<string, Set<OrderBookCallback>> = new Map();
  private markPriceCallbacks: Map<string, Set<MarkPriceCallback>> = new Map();

  private prices: Map<string, PriceData> = new Map();
  private sockets: Map<string, WebSocket> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();

  private readonly MAX_RECONNECT = 5;
  private readonly RECONNECT_DELAY = 3000;

  private get wsBaseUrl(): string {
    const isTestnet = process.env.BINANCE_TESTNET === "true";
    return isTestnet
      ? "wss://stream.binancefuture.com"
      : "wss://fstream.binance.com";
  }

  // ============================================
  // 가격 구독
  // ============================================

  subscribePrice(symbol: string, callback: PriceCallback): () => void {
    const normalizedSymbol = this.normalizeSymbol(symbol);

    if (!this.priceCallbacks.has(normalizedSymbol)) {
      this.priceCallbacks.set(normalizedSymbol, new Set());
    }

    this.priceCallbacks.get(normalizedSymbol)!.add(callback);

    // 첫 구독이면 WebSocket 연결
    const streamKey = `price:${normalizedSymbol}`;
    if (!this.sockets.has(streamKey)) {
      this.startPriceStream(normalizedSymbol);
    }

    // 구독 해제 함수
    return () => {
      const callbacks = this.priceCallbacks.get(normalizedSymbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.priceCallbacks.delete(normalizedSymbol);
          this.closeStream(`price:${normalizedSymbol}`);
        }
      }
    };
  }

  // ============================================
  // 오더북 구독
  // ============================================

  subscribeOrderBook(symbol: string, callback: OrderBookCallback): () => void {
    const normalizedSymbol = this.normalizeSymbol(symbol);

    if (!this.orderBookCallbacks.has(normalizedSymbol)) {
      this.orderBookCallbacks.set(normalizedSymbol, new Set());
    }

    this.orderBookCallbacks.get(normalizedSymbol)!.add(callback);

    const streamKey = `orderbook:${normalizedSymbol}`;
    if (!this.sockets.has(streamKey)) {
      this.startOrderBookStream(normalizedSymbol);
    }

    return () => {
      const callbacks = this.orderBookCallbacks.get(normalizedSymbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.orderBookCallbacks.delete(normalizedSymbol);
          this.closeStream(`orderbook:${normalizedSymbol}`);
        }
      }
    };
  }

  // ============================================
  // 마크 가격 / 펀딩비 구독
  // ============================================

  subscribeMarkPrice(symbol: string, callback: MarkPriceCallback): () => void {
    const normalizedSymbol = this.normalizeSymbol(symbol);

    if (!this.markPriceCallbacks.has(normalizedSymbol)) {
      this.markPriceCallbacks.set(normalizedSymbol, new Set());
    }

    this.markPriceCallbacks.get(normalizedSymbol)!.add(callback);

    const streamKey = `markprice:${normalizedSymbol}`;
    if (!this.sockets.has(streamKey)) {
      this.startMarkPriceStream(normalizedSymbol);
    }

    return () => {
      const callbacks = this.markPriceCallbacks.get(normalizedSymbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.markPriceCallbacks.delete(normalizedSymbol);
          this.closeStream(`markprice:${normalizedSymbol}`);
        }
      }
    };
  }

  // ============================================
  // Stream 시작
  // ============================================

  private startPriceStream(symbol: string): void {
    // Binance uses lowercase symbols
    const stream = `${symbol.toLowerCase()}@aggTrade`;
    const url = `${this.wsBaseUrl}/ws/${stream}`;
    const streamKey = `price:${symbol}`;

    this.connect(streamKey, url, (data) => {
      // AggTrade format: { e: 'aggTrade', s: 'BTCUSDT', p: '95000.00', ... }
      const priceData: PriceData = {
        symbol: symbol.replace("USDT", ""),
        price: parseFloat(data.p),
        timestamp: data.T || Date.now(),
      };

      this.prices.set(symbol, priceData);
      this.notifyPriceCallbacks(symbol, priceData);
    });

    console.log(`📡 [Binance WS] Subscribed to price: ${symbol}`);
  }

  private startOrderBookStream(symbol: string): void {
    const stream = `${symbol.toLowerCase()}@depth5@100ms`;
    const url = `${this.wsBaseUrl}/ws/${stream}`;
    const streamKey = `orderbook:${symbol}`;

    this.connect(streamKey, url, (data) => {
      const orderBookData: OrderBookData = {
        symbol: symbol.replace("USDT", ""),
        bids: data.b.map((level: [string, string]) => ({
          price: level[0],
          size: level[1],
        })),
        asks: data.a.map((level: [string, string]) => ({
          price: level[0],
          size: level[1],
        })),
        timestamp: Date.now(),
      };

      this.notifyOrderBookCallbacks(symbol, orderBookData);
    });

    console.log(`📡 [Binance WS] Subscribed to orderbook: ${symbol}`);
  }

  private startMarkPriceStream(symbol: string): void {
    const stream = `${symbol.toLowerCase()}@markPrice`;
    const url = `${this.wsBaseUrl}/ws/${stream}`;
    const streamKey = `markprice:${symbol}`;

    this.connect(streamKey, url, (data) => {
      const markPriceData: MarkPriceData = {
        symbol: symbol.replace("USDT", ""),
        markPrice: parseFloat(data.p),
        indexPrice: parseFloat(data.i),
        fundingRate: parseFloat(data.r),
        nextFundingTime: data.T,
      };

      this.notifyMarkPriceCallbacks(symbol, markPriceData);
    });

    console.log(`📡 [Binance WS] Subscribed to markPrice: ${symbol}`);
  }

  // ============================================
  // WebSocket 연결 관리
  // ============================================

  private connect(
    streamKey: string,
    url: string,
    onMessage: (data: any) => void
  ): void {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log(`🔗 [Binance WS] Connected: ${streamKey}`);
        this.reconnectAttempts.set(streamKey, 0);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          onMessage(data);
        } catch (error) {
          console.error(`[Binance WS] Parse error:`, error);
        }
      };

      ws.onerror = (error) => {
        console.error(`[Binance WS] Error on ${streamKey}:`, error);
      };

      ws.onclose = () => {
        console.log(`📴 [Binance WS] Disconnected: ${streamKey}`);
        this.sockets.delete(streamKey);
        this.attemptReconnect(streamKey, url, onMessage);
      };

      this.sockets.set(streamKey, ws);
    } catch (error) {
      console.error(`[Binance WS] Failed to connect:`, error);
    }
  }

  private attemptReconnect(
    streamKey: string,
    url: string,
    onMessage: (data: any) => void
  ): void {
    const attempts = this.reconnectAttempts.get(streamKey) || 0;

    if (attempts >= this.MAX_RECONNECT) {
      console.error(
        `[Binance WS] Max reconnect attempts reached for ${streamKey}`
      );
      return;
    }

    this.reconnectAttempts.set(streamKey, attempts + 1);

    setTimeout(
      () => {
        console.log(
          `🔄 [Binance WS] Reconnecting ${streamKey} (${attempts + 1}/${this.MAX_RECONNECT})`
        );
        this.connect(streamKey, url, onMessage);
      },
      this.RECONNECT_DELAY * (attempts + 1)
    );
  }

  private closeStream(streamKey: string): void {
    const ws = this.sockets.get(streamKey);
    if (ws) {
      ws.close();
      this.sockets.delete(streamKey);
      console.log(`📴 [Binance WS] Closed: ${streamKey}`);
    }
  }

  // ============================================
  // 콜백 알림
  // ============================================

  private notifyPriceCallbacks(symbol: string, data: PriceData): void {
    const callbacks = this.priceCallbacks.get(symbol);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (error) {
          console.error(`[Binance WS] Callback error:`, error);
        }
      }
    }
  }

  private notifyOrderBookCallbacks(symbol: string, data: OrderBookData): void {
    const callbacks = this.orderBookCallbacks.get(symbol);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (error) {
          console.error(`[Binance WS] Callback error:`, error);
        }
      }
    }
  }

  private notifyMarkPriceCallbacks(symbol: string, data: MarkPriceData): void {
    const callbacks = this.markPriceCallbacks.get(symbol);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (error) {
          console.error(`[Binance WS] Callback error:`, error);
        }
      }
    }
  }

  // ============================================
  // 유틸리티
  // ============================================

  private normalizeSymbol(symbol: string): string {
    // BTC → BTCUSDT
    return symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
  }

  getPrice(symbol: string): PriceData | undefined {
    return this.prices.get(this.normalizeSymbol(symbol));
  }

  getStatus(): {
    connected: number;
    streams: string[];
  } {
    return {
      connected: this.sockets.size,
      streams: Array.from(this.sockets.keys()),
    };
  }

  closeAll(): void {
    for (const [key, ws] of this.sockets) {
      ws.close();
    }
    this.sockets.clear();
    this.priceCallbacks.clear();
    this.orderBookCallbacks.clear();
    this.markPriceCallbacks.clear();
    console.log("📴 [Binance WS] All connections closed");
  }
}

export const binanceWS = new BinanceWebSocketService();
