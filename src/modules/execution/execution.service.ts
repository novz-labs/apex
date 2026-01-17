// src/modules/execution/execution.service.ts

import * as binanceService from "../binance";
import * as hyperliquidService from "../hyperliquid";
import { telegramService } from "../notification/telegram.service";
import { closeTrade, createTrade } from "../trade/trade.service";

// ============================================
// 타입 정의
// ============================================

export type ExchangeType = "hyperliquid" | "binance";

export interface ExecutionResult {
  success: boolean;
  orderId?: string | number;
  filledPrice?: number;
  filledSize?: number;
  error?: string;
}

export interface ExecutionConfig {
  exchange: ExchangeType;
  paperMode: boolean; // Paper mode - 실제 주문 없이 시뮬레이션
}

// ============================================
// Execution Service
// ============================================

class ExecutionService {
  private config: ExecutionConfig;

  constructor() {
    // 환경변수에서 설정 읽기
    const paperMode = process.env.PAPER_MODE !== "false"; // 기본값: true (안전)
    const exchange = (process.env.EXCHANGE as ExchangeType) || "hyperliquid";

    this.config = {
      exchange,
      paperMode,
    };

    console.log(
      `⚙️ ExecutionService initialized: exchange=${this.config.exchange}, paperMode=${this.config.paperMode}`
    );
  }

  /**
   * 설정 변경
   */
  configure(config: Partial<ExecutionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(
      `⚙️ ExecutionService configured: exchange=${this.config.exchange}, paperMode=${this.config.paperMode}`
    );
  }

  /**
   * Paper Mode 여부 확인
   */
  isPaperMode(): boolean {
    return this.config.paperMode;
  }

  /**
   * 주문 실행 (매수/매도)
   */
  async executeOrder(params: {
    symbol: string;
    side: "buy" | "sell";
    size: number;
    price?: number; // undefined면 시장가
    strategyId: string;
    reason?: string;
    exchange?: ExchangeType; // 전략별 거래소 선택 (없으면 기본값 사용)
  }): Promise<ExecutionResult> {
    const { symbol, side, size, price, strategyId, reason } = params;
    const exchange = params.exchange ?? this.config.exchange; // 기본값 fallback

    console.log(
      `📤 [Execution] ${side.toUpperCase()} ${size} ${symbol} @ ${price ?? "MARKET"} (${exchange})`
    );

    // Paper Mode - 실제 주문 없이 시뮬레이션
    if (this.config.paperMode) {
      return this.executePaperOrder({ ...params, exchange });
    }

    // Live Mode - 실제 거래소에 주문
    try {
      let result: ExecutionResult;

      if (exchange === "hyperliquid") {
        result = await this.executeHyperliquidOrder(params);
      } else {
        result = await this.executeBinanceOrder(params);
      }

      // 성공 시 DB에 기록 및 알림
      if (result.success && result.filledPrice) {
        await createTrade({
          symbol,
          side: side === "buy" ? "long" : "short",
          entryPrice: result.filledPrice,
          size,
          leverage: 1, // 레버리지는 전략에서 관리
          strategyId,
          indicatorsJson: JSON.stringify({ reason }),
        });

        await telegramService.notifyTrade({
          type: "open",
          symbol,
          side: side === "buy" ? "long" : "short",
          price: result.filledPrice,
          size,
          reason,
        });
      }

      return result;
    } catch (error) {
      console.error(`❌ [Execution] Order failed:`, error);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * 포지션 청산
   */
  async closePosition(params: {
    tradeId: string;
    symbol: string;
    side: "buy" | "sell"; // 청산 방향 (기존 포지션의 반대)
    size: number;
    exitPrice: number;
    exitReason: "tp" | "sl" | "trailing_stop" | "manual";
    exchange?: ExchangeType; // 전략별 거래소 선택
  }): Promise<ExecutionResult> {
    const { tradeId, symbol, side, size, exitPrice, exitReason } = params;
    const exchange = params.exchange ?? this.config.exchange;

    console.log(
      `📥 [Execution] CLOSE ${side.toUpperCase()} ${size} ${symbol} @ ${exitPrice} (${exitReason}) [${exchange}]`
    );

    // Paper Mode
    if (this.config.paperMode) {
      const result = await closeTrade({ tradeId, exitPrice, exitReason });

      await telegramService.notifyTrade({
        type: "close",
        symbol,
        side: side === "buy" ? "long" : "short",
        price: exitPrice,
        size,
        pnl: result.pnl ?? 0,
        reason: exitReason,
      });

      return {
        success: true,
        filledPrice: exitPrice,
        filledSize: size,
      };
    }

    // Live Mode
    try {
      let result: ExecutionResult;

      if (exchange === "hyperliquid") {
        result = await this.executeHyperliquidOrder({
          symbol,
          side,
          size,
          price: exitPrice,
        });
      } else {
        result = await this.executeBinanceOrder({
          symbol,
          side,
          size,
          price: exitPrice,
        });
      }

      if (result.success) {
        const closedTrade = await closeTrade({
          tradeId,
          exitPrice,
          exitReason,
        });

        await telegramService.notifyTrade({
          type: "close",
          symbol,
          side: side === "buy" ? "long" : "short",
          price: exitPrice,
          size,
          pnl: closedTrade.pnl ?? 0,
          reason: exitReason,
        });
      }

      return result;
    } catch (error) {
      console.error(`❌ [Execution] Close failed:`, error);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  // ============================================
  // Private: Paper Mode
  // ============================================

  private async executePaperOrder(params: {
    symbol: string;
    side: "buy" | "sell";
    size: number;
    price?: number;
    strategyId: string;
    reason?: string;
    exchange?: ExchangeType;
  }): Promise<ExecutionResult> {
    // Paper 모드에서는 가격을 그대로 사용
    const filledPrice = params.price ?? 0;
    const exchange = params.exchange ?? "hyperliquid";

    console.log(
      `📝 [Paper] ${params.side.toUpperCase()} ${params.size} ${params.symbol} @ $${filledPrice} (${exchange})`
    );

    // DB에 기록
    await createTrade({
      symbol: params.symbol,
      side: params.side === "buy" ? "long" : "short",
      entryPrice: filledPrice,
      size: params.size,
      leverage: 1,
      strategyId: params.strategyId,
      indicatorsJson: JSON.stringify({
        reason: params.reason,
        paper: true,
        exchange,
      }),
    });

    return {
      success: true,
      orderId: `paper_${Date.now()}`,
      filledPrice,
      filledSize: params.size,
    };
  }

  // ============================================
  // Private: Hyperliquid
  // ============================================

  private async executeHyperliquidOrder(params: {
    symbol: string;
    side: "buy" | "sell";
    size: number;
    price?: number;
  }): Promise<ExecutionResult> {
    const { symbol, side, size, price } = params;

    // Hyperliquid은 시장가 주문이 없으므로 항상 limit 사용
    if (!price) {
      return {
        success: false,
        error: "Hyperliquid requires price for limit orders",
      };
    }

    const result = (await hyperliquidService.placeOrder({
      coin: symbol,
      isBuy: side === "buy",
      price: price.toString(),
      size: size.toString(),
      timeInForce: "Ioc", // Immediate or Cancel
    })) as any;

    // 응답 파싱 (Hyperliquid 응답 구조에 따라 조정 필요)
    if (result?.response?.data?.statuses?.[0]?.filled) {
      return {
        success: true,
        orderId: result.response.data.statuses[0].resting?.oid,
        filledPrice: price,
        filledSize: size,
      };
    }

    return {
      success: false,
      error: JSON.stringify(result),
    };
  }

  // ============================================
  // Private: Binance
  // ============================================

  private async executeBinanceOrder(params: {
    symbol: string;
    side: "buy" | "sell";
    size: number;
    price?: number;
  }): Promise<ExecutionResult> {
    const { symbol, side, size, price } = params;

    const orderType = price ? "LIMIT" : "MARKET";

    const result = await binanceService.placeOrder({
      symbol: symbol + "USDT", // Binance는 BTCUSDT 형식
      side: side === "buy" ? "BUY" : "SELL",
      type: orderType,
      quantity: size.toFixed(4),
      price: price?.toFixed(2),
      timeInForce: price ? "GTC" : undefined,
    });

    if (result.orderId) {
      return {
        success: true,
        orderId: result.orderId,
        filledPrice: parseFloat(result.price),
        filledSize: parseFloat(result.origQty),
      };
    }

    return {
      success: false,
      error: "Order placement failed",
    };
  }

  // ============================================
  // Status
  // ============================================

  getConfig(): ExecutionConfig {
    return { ...this.config };
  }
}

export const executionService = new ExecutionService();
