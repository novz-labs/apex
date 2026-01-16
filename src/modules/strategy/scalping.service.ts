// src/modules/strategy/scalping.service.ts

import { type StrategyStats, type TradingStrategy } from "../../types";

// ============================================
// 타입 정의
// ============================================

export interface ScalpingConfig {
  symbol: string;
  timeframe: "1m" | "5m"; // 1분 또는 5분봉

  // 진입 조건
  rsiLow: number; // 25 (과매도)
  rsiHigh: number; // 75 (과매수)

  // 목표 수익
  takeProfitPercent: number; // 0.3-0.5%
  stopLossPercent: number; // 0.2-0.3%

  // 필터
  minVolume24h: number; // 최소 24시간 거래량
  maxSpreadPercent: number; // 최대 스프레드 %

  // 일일 한도
  maxDailyTrades: number; // 일일 최대 거래 수
  maxDailyLoss: number; // 일일 최대 손실 $

  // 자본
  leverage: number;
  totalCapital: number;
  positionSizePercent: number; // 1회 포지션 크기 (자본의 %)
}

export interface ScalpTrade {
  id: string;
  entryTime: Date;
  entryPrice: number;
  side: "long" | "short";
  size: number;
  targetPrice: number;
  stopPrice: number;
  status: "open" | "won" | "lost";
  exitTime?: Date;
  exitPrice?: number;
  pnl?: number;
  holdingTimeMs?: number;
}

export interface ScalpingIndicators {
  rsi: number;
  stochK?: number;
  stochD?: number;
  atr?: number; // Average True Range
  volume24h: number;
  bidPrice: number;
  askPrice: number;
}

export interface ScalpingStats extends StrategyStats {
  todayTrades: number;
  todayPnL: number;
  todayWins: number;
  todayLosses: number;
  remainingTrades: number;
  averageHoldingTime: number; // ms
  currentPosition: ScalpTrade | null;
}

// ============================================
// Scalping 전략 클래스
// ============================================

export class ScalpingStrategy implements TradingStrategy {
  private config: ScalpingConfig;
  private isRunning: boolean = false;
  private currentPosition: ScalpTrade | null = null;

  // 일일 통계
  private todayTrades: ScalpTrade[] = [];
  private todayPnL: number = 0;
  private lastResetDate: string = "";

  // 전체 통계
  private allTrades: ScalpTrade[] = [];
  private totalPnL: number = 0;

  constructor(config: ScalpingConfig) {
    this.config = this.validateAndNormalize(config);
    this.resetDailyStats();
  }

  // ============================================
  // 설정 검증
  // ============================================

  private validateAndNormalize(config: ScalpingConfig): ScalpingConfig {
    if (config.rsiLow < 10 || config.rsiLow > 40) {
      throw new Error("rsiLow must be between 10 and 40");
    }

    if (config.rsiHigh < 60 || config.rsiHigh > 95) {
      throw new Error("rsiHigh must be between 60 and 95");
    }

    if (config.takeProfitPercent < 0.1 || config.takeProfitPercent > 2) {
      throw new Error("takeProfitPercent must be between 0.1 and 2");
    }

    if (config.stopLossPercent < 0.1 || config.stopLossPercent > 1) {
      throw new Error("stopLossPercent must be between 0.1 and 1");
    }

    if (config.maxDailyTrades < 1 || config.maxDailyTrades > 100) {
      throw new Error("maxDailyTrades must be between 1 and 100");
    }

    return config;
  }

  // ============================================
  // 일일 통계 리셋
  // ============================================

  private resetDailyStats(): void {
    const today = new Date().toISOString().split("T")[0];

    if (this.lastResetDate !== today) {
      this.todayTrades = [];
      this.todayPnL = 0;
      this.lastResetDate = today;
      console.log("🔄 Scalping daily stats reset");
    }
  }

  // ============================================
  // 진입 조건 체크
  // ============================================

  checkEntry(indicators: ScalpingIndicators): {
    canTrade: boolean;
    side?: "long" | "short";
    reason: string;
    confidence?: number;
  } {
    this.resetDailyStats();

    // 이미 포지션이 있으면 진입 불가
    if (this.currentPosition) {
      return { canTrade: false, reason: "Position already open" };
    }

    // 일일 거래 한도 체크
    if (this.todayTrades.length >= this.config.maxDailyTrades) {
      return { canTrade: false, reason: "Daily trade limit reached" };
    }

    // 일일 손실 한도 체크
    if (this.todayPnL <= -this.config.maxDailyLoss) {
      return { canTrade: false, reason: "Daily loss limit reached" };
    }

    // 거래량 체크
    if (indicators.volume24h < this.config.minVolume24h) {
      return {
        canTrade: false,
        reason: `Insufficient volume: ${indicators.volume24h.toFixed(0)}`,
      };
    }

    // 스프레드 체크
    const spread =
      ((indicators.askPrice - indicators.bidPrice) / indicators.bidPrice) * 100;
    if (spread > this.config.maxSpreadPercent) {
      return {
        canTrade: false,
        reason: `Spread too wide: ${spread.toFixed(4)}%`,
      };
    }

    // RSI 기반 진입
    const { rsi } = indicators;

    // 과매도 → Long
    if (rsi < this.config.rsiLow) {
      const confidence = Math.min(1, (this.config.rsiLow - rsi) / 15);
      return {
        canTrade: true,
        side: "long",
        reason: `RSI oversold: ${rsi.toFixed(1)}`,
        confidence,
      };
    }

    // 과매수 → Short
    if (rsi > this.config.rsiHigh) {
      const confidence = Math.min(1, (rsi - this.config.rsiHigh) / 15);
      return {
        canTrade: true,
        side: "short",
        reason: `RSI overbought: ${rsi.toFixed(1)}`,
        confidence,
      };
    }

    // Stochastic 추가 조건 (설정된 경우)
    if (indicators.stochK !== undefined && indicators.stochD !== undefined) {
      // Stoch K가 20 이하이고 D를 상향 돌파 → Long
      if (
        indicators.stochK < 20 &&
        indicators.stochK > indicators.stochD &&
        rsi < 40
      ) {
        return {
          canTrade: true,
          side: "long",
          reason: `Stoch bullish crossover (K: ${indicators.stochK.toFixed(1)})`,
          confidence: 0.7,
        };
      }

      // Stoch K가 80 이상이고 D를 하향 돌파 → Short
      if (
        indicators.stochK > 80 &&
        indicators.stochK < indicators.stochD &&
        rsi > 60
      ) {
        return {
          canTrade: true,
          side: "short",
          reason: `Stoch bearish crossover (K: ${indicators.stochK.toFixed(1)})`,
          confidence: 0.7,
        };
      }
    }

    return { canTrade: false, reason: "No signal" };
  }

  // ============================================
  // 포지션 열기
  // ============================================

  openPosition(
    side: "long" | "short",
    entryPrice: number,
    reason?: string
  ): ScalpTrade {
    const { takeProfitPercent, stopLossPercent, totalCapital, leverage, positionSizePercent } =
      this.config;

    // 포지션 크기 계산
    const positionValue = (totalCapital * positionSizePercent / 100) * leverage;
    const size = positionValue / entryPrice;

    // TP/SL 가격 계산
    const targetPrice =
      side === "long"
        ? entryPrice * (1 + takeProfitPercent / 100)
        : entryPrice * (1 - takeProfitPercent / 100);

    const stopPrice =
      side === "long"
        ? entryPrice * (1 - stopLossPercent / 100)
        : entryPrice * (1 + stopLossPercent / 100);

    const trade: ScalpTrade = {
      id: `scalp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      entryTime: new Date(),
      entryPrice,
      side,
      size,
      targetPrice,
      stopPrice,
      status: "open",
    };

    this.currentPosition = trade;
    this.todayTrades.push(trade);
    this.allTrades.push(trade);

    console.log(
      `⚡ Scalp ${side.toUpperCase()} @ $${entryPrice.toFixed(2)} ${reason ? `(${reason})` : ""}`
    );
    console.log(
      `   TP: $${targetPrice.toFixed(2)} (+${takeProfitPercent}%) | SL: $${stopPrice.toFixed(2)} (-${stopLossPercent}%)`
    );
    console.log(`   Size: ${size.toFixed(6)} ($${positionValue.toFixed(2)})`);

    return { ...trade };
  }

  // ============================================
  // 가격 업데이트 (TP/SL 체크)
  // ============================================

  onPriceUpdate(currentPrice: number): {
    action: "hold" | "tp" | "sl" | "none";
    position: ScalpTrade | null;
    closedPnl?: number;
  } {
    if (!this.isRunning) {
      return { action: "none", position: null };
    }

    if (!this.currentPosition) {
      return { action: "hold", position: null };
    }

    const { side, targetPrice, stopPrice } = this.currentPosition;

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

  // ============================================
  // 포지션 종료
  // ============================================

  closePosition(
    exitPrice: number,
    reason: "tp" | "sl" | "manual"
  ): {
    action: "tp" | "sl";
    position: ScalpTrade | null;
    closedPnl: number;
  } {
    if (!this.currentPosition) {
      return { action: reason === "tp" ? "tp" : "sl", position: null, closedPnl: 0 };
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

    // 통계 업데이트
    this.todayPnL += pnl;
    this.totalPnL += pnl;

    const emoji = reason === "tp" ? "✅" : "❌";
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100 * (side === "long" ? 1 : -1);

    console.log(
      `${emoji} Scalp ${reason.toUpperCase()} @ $${exitPrice.toFixed(2)}`
    );
    console.log(
      `   PnL: $${pnl.toFixed(2)} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(3)}%)`
    );
    console.log(
      `   Holding: ${((this.currentPosition.holdingTimeMs || 0) / 1000).toFixed(0)}s | Daily: $${this.todayPnL.toFixed(2)}`
    );

    const closedPosition = { ...this.currentPosition };
    this.currentPosition = null;

    return {
      action: reason === "tp" ? "tp" : "sl",
      position: closedPosition,
      closedPnl: pnl,
    };
  }

  // ============================================
  // 강제 청산
  // ============================================

  forceClose(currentPrice: number): ScalpTrade | null {
    if (!this.currentPosition) return null;

    const result = this.closePosition(currentPrice, "manual");
    return result.position;
  }

  // ============================================
  // 전략 제어
  // ============================================

  start(): void {
    this.isRunning = true;
    this.resetDailyStats();
    console.log(`⚡ Scalping Strategy started for ${this.config.symbol}`);
    console.log(`   Max daily trades: ${this.config.maxDailyTrades}`);
    console.log(`   TP: ${this.config.takeProfitPercent}% | SL: ${this.config.stopLossPercent}%`);
  }

  stop(): void {
    this.isRunning = false;
    console.log(`🛑 Scalping Strategy stopped`);
    console.log(`   Today's PnL: $${this.todayPnL.toFixed(2)}`);
    console.log(`   Total PnL: $${this.totalPnL.toFixed(2)}`);
  }

  // ============================================
  // 통계 조회
  // ============================================

  getStats(): ScalpingStats {
    this.resetDailyStats();

    const todayWins = this.todayTrades.filter((t) => t.status === "won").length;
    const todayLosses = this.todayTrades.filter((t) => t.status === "lost").length;

    const allWins = this.allTrades.filter((t) => t.status === "won");
    const allLosses = this.allTrades.filter((t) => t.status === "lost");

    // 평균 홀딩 시간 계산
    const closedTrades = this.allTrades.filter((t) => t.holdingTimeMs);
    const avgHoldingTime =
      closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => sum + (t.holdingTimeMs || 0), 0) /
          closedTrades.length
        : 0;

    return {
      totalTrades: this.allTrades.length,
      wins: allWins.length,
      losses: allLosses.length,
      pnl: this.totalPnL,
      totalPnL: this.totalPnL,
      realizedPnL: this.totalPnL,
      unrealizedPnL: 0, // 스캘핑은 빠른 청산이므로 미실현 PnL은 거의 없음
      winRate:
        this.allTrades.length > 0
          ? allWins.length / (allWins.length + allLosses.length)
          : 0,
      isRunning: this.isRunning,

      // 스캘핑 전용 통계
      todayTrades: this.todayTrades.length,
      todayPnL: this.todayPnL,
      todayWins,
      todayLosses,
      remainingTrades: this.config.maxDailyTrades - this.todayTrades.length,
      averageHoldingTime: avgHoldingTime,
      currentPosition: this.currentPosition ? { ...this.currentPosition } : null,
    };
  }

  getConfig(): ScalpingConfig {
    return { ...this.config };
  }

  getCurrentPosition(): ScalpTrade | null {
    return this.currentPosition ? { ...this.currentPosition } : null;
  }

  getTodayTrades(): ScalpTrade[] {
    return [...this.todayTrades];
  }
}

// ============================================
// 팩토리 함수 & 기본 설정
// ============================================

export function createScalpingStrategy(config: ScalpingConfig): ScalpingStrategy {
  return new ScalpingStrategy(config);
}

export const DEFAULT_SCALPING_CONFIG: Partial<ScalpingConfig> = {
  timeframe: "1m",
  rsiLow: 25,
  rsiHigh: 75,
  takeProfitPercent: 0.4,
  stopLossPercent: 0.25,
  maxSpreadPercent: 0.05,
  maxDailyTrades: 20,
  maxDailyLoss: 50,
  leverage: 5,
  positionSizePercent: 10, // 자본의 10%
};
