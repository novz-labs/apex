// src/modules/strategy/scalping.service.ts
import { type StrategyStats, type TradingStrategy } from "../../types";
import { indicatorService } from "../market/indicator.service";

// ============================================
// 타입 정의
// ============================================

export interface ScalpingConfig {
  symbol: string;
  timeframe: string;
  rsiLow: number;
  rsiHigh: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  maxSpreadPercent: number;
  maxDailyTrades: number;
  maxDailyLoss: number;
  leverage: number;
  positionSizePercent: number;
  totalCapital: number;
}

export interface ScalpTrade {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice?: number;
  size: number;
  entryTime: Date;
  exitTime?: Date;
  pnl?: number;
  status: "open" | "won" | "lost";
  reason: string;
  holdingTimeMs?: number;
}

export interface ScalpingIndicators {
  rsi: number;
  stochK: number;
  stochD: number;
  atr: number;
  volume24h: number;
  bidPrice: number;
  askPrice: number;
}

// ============================================
// Scalping 전략 서비스
// ============================================

export class ScalpingStrategy implements TradingStrategy {
  private currentPosition: ScalpTrade | null = null;
  private isRunning: boolean = false;
  private todayTrades: ScalpTrade[] = [];
  private todayPnL: number = 0;

  constructor(public config: ScalpingConfig) {}

  /**
   * 전략 시작
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[Scalping] Started for ${this.config.symbol}`);
  }

  /**
   * 전략 중지
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    console.log(`[Scalping] Stopped for ${this.config.symbol}`);
  }

  /**
   * 실시간 가격 업데이트 처리
   */
  async onPriceUpdate(currentPrice: number): Promise<{
    action: "hold" | "tp" | "sl" | "none" | "open";
    position: ScalpTrade | null;
    closedPnl?: number;
    signal?: any;
  }> {
    if (!this.isRunning) {
      return { action: "none", position: null };
    }

    if (!this.currentPosition) {
      // 실시간 인디케이터 계산 로직 (DB 연동)
      // TODO: 실제 bid/ask 가격 연동 필요 (현재는 currentPrice 기준)
      const indicators = await indicatorService.getScalpingIndicators(
        this.config.symbol,
        "1m",
        currentPrice,
        currentPrice - 0.01,
        currentPrice + 0.01
      );

      if (!indicators) {
        return { action: "hold", position: null };
      }

      const signal = this.checkEntry(indicators);
      if (signal.canTrade && signal.side) {
        const position = this.openPosition(
          signal.side,
          currentPrice,
          signal.reason || "Unknown"
        );
        return { action: "open", position, signal };
      }

      return { action: "hold", position: null };
    } else {
      // 포지션 관리 (TP/SL/Exit)
      const res = this.managePosition(currentPrice);
      return res;
    }
  }

  /**
   * 진입 조건 확인
   */
  private checkEntry(indicators: ScalpingIndicators): {
    canTrade: boolean;
    side?: "long" | "short";
    reason?: string;
  } {
    // 1. 일일 거래 제한 확인
    if (this.todayTrades.length >= this.config.maxDailyTrades) {
      return { canTrade: false, reason: "Max daily trades reached" };
    }

    // 2. 일일 손실 제한 확인
    if (this.todayPnL <= -this.config.maxDailyLoss) {
      return { canTrade: false, reason: "Max daily loss reached" };
    }

    // 3. 스프레드 확인
    const spreadPercent =
      ((indicators.askPrice - indicators.bidPrice) / indicators.bidPrice) * 100;
    if (spreadPercent > this.config.maxSpreadPercent) {
      return { canTrade: false, reason: "Spread too wide" };
    }

    // 4. 기술 지표 기반 진입 (RSI 과매수/과매도 + 스토캐스틱 골든/데드크로스)
    // Long: RSI < Low + Stoch K > D
    if (
      indicators.rsi < this.config.rsiLow &&
      indicators.stochK > indicators.stochD
    ) {
      return {
        canTrade: true,
        side: "long",
        reason: "Oversold + Stoch Golden Cross",
      };
    }

    // Short: RSI > High + Stoch K < D
    if (
      indicators.rsi > this.config.rsiHigh &&
      indicators.stochK < indicators.stochD
    ) {
      return {
        canTrade: true,
        side: "short",
        reason: "Overbought + Stoch Dead Cross",
      };
    }

    return { canTrade: false };
  }

  /**
   * 포지션 오픈
   */
  private openPosition(
    side: "long" | "short",
    price: number,
    reason: string
  ): ScalpTrade {
    const size =
      (this.config.totalCapital * (this.config.positionSizePercent / 100)) /
      price;

    this.currentPosition = {
      id: Math.random().toString(36).substring(7),
      symbol: this.config.symbol,
      side,
      entryPrice: price,
      size,
      entryTime: new Date(),
      status: "open",
      reason,
    };

    console.log(`[Scalping] Entry: ${side} @ ${price} (${reason})`);
    return this.currentPosition;
  }

  /**
   * 포지션 관리 (TP/SL 체크)
   */
  private managePosition(currentPrice: number): {
    action: "hold" | "tp" | "sl";
    position: ScalpTrade | null;
    closedPnl?: number;
  } {
    if (!this.currentPosition) {
      return { action: "hold", position: null };
    }

    const { side, entryPrice } = this.currentPosition;
    const tpDist = entryPrice * (this.config.takeProfitPercent / 100);
    const slDist = entryPrice * (this.config.stopLossPercent / 100);

    const targetPrice =
      side === "long" ? entryPrice + tpDist : entryPrice - tpDist;
    const stopPrice =
      side === "long" ? entryPrice - slDist : entryPrice + slDist;

    // Long 포지션
    if (side === "long") {
      if (currentPrice >= targetPrice) {
        return this.closePosition(currentPrice, "tp");
      }
      if (currentPrice <= stopPrice) {
        return this.closePosition(currentPrice, "sl");
      }
    }

    // Short 포지션
    if (side === "short") {
      if (currentPrice <= targetPrice) {
        return this.closePosition(currentPrice, "tp");
      }
      if (currentPrice >= stopPrice) {
        return this.closePosition(currentPrice, "sl");
      }
    }

    return { action: "hold", position: { ...this.currentPosition } };
  }

  /**
   * 포지션 종료
   */
  private closePosition(
    exitPrice: number,
    reason: "tp" | "sl" | "manual"
  ): {
    action: "tp" | "sl";
    position: ScalpTrade | null;
    closedPnl: number;
  } {
    if (!this.currentPosition) {
      return {
        action: reason === "tp" ? "tp" : "sl",
        position: null,
        closedPnl: 0,
      };
    }

    const { side, entryPrice, size, entryTime } = this.currentPosition;

    // PnL 계산
    const priceDiff =
      side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
    const pnl = size * priceDiff;

    // 거래 완료 처리
    this.currentPosition.status = pnl > 0 ? "won" : "lost";
    this.currentPosition.exitTime = new Date();
    this.currentPosition.exitPrice = exitPrice;
    this.currentPosition.pnl = pnl;
    this.currentPosition.holdingTimeMs =
      this.currentPosition.exitTime.getTime() - entryTime.getTime();

    // 일일 통계 업데이트
    this.todayTrades.push({ ...this.currentPosition });
    this.todayPnL += pnl;

    const action = reason === "tp" ? "tp" : "sl";
    const closedPos = { ...this.currentPosition };

    console.log(
      `[Scalping] Exit (${reason}): $${pnl.toFixed(2)} (${(
        (pnl /
          ((this.config.totalCapital * this.config.positionSizePercent) /
            100)) *
        100
      ).toFixed(2)}%)`
    );

    this.currentPosition = null;
    return { action, position: closedPos, closedPnl: pnl };
  }

  /**
   * 전체 관리 통계 조회
   */
  getStats(): StrategyStats {
    const todayWins = this.todayTrades.filter((t) => t.status === "won").length;
    const todayLosses = this.todayTrades.filter(
      (t) => t.status === "lost"
    ).length;
    const avgHoldingTime =
      this.todayTrades.reduce((acc, t) => acc + (t.holdingTimeMs || 0), 0) /
      (this.todayTrades.length || 1);

    return {
      totalTrades: this.todayTrades.length,
      winRate: (todayWins / (this.todayTrades.length || 1)) * 100,
      totalPnL: this.todayPnL,
      isRunning: this.isRunning,
      wins: todayWins,
      losses: todayLosses,
    };
  }

  getConfig(): ScalpingConfig {
    return { ...this.config };
  }
}

/**
 * Scalping 전략 생성 헬퍼
 */
export function createScalpingStrategy(
  config: ScalpingConfig
): ScalpingStrategy {
  return new ScalpingStrategy(config);
}
