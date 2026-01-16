// src/modules/strategy/momentum.service.ts

// ============================================
// 타입 정의
// ============================================

export interface MomentumConfig {
  symbol: string;

  // RSI 설정
  rsiOversold: number; // 기본 30
  rsiOverbought: number; // 기본 70

  // Bollinger Bands
  bbStdDev: number; // 기본 2

  // ADX (추세 강도)
  adxThreshold: number; // 기본 25

  // 리스크 관리
  leverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;

  // 자본 배분
  totalCapital: number;
}

export interface IndicatorSnapshot {
  rsi: number;
  bbPosition: "above_upper" | "below_lower" | "within";
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  ema20: number;
  ema50: number;
  ema100: number;
  macdCrossover: "bullish" | "bearish" | "none";
  macdLine: number;
  signalLine: number;
  macdHistogram: number;
}

export interface MomentumSignal {
  direction: "long" | "short" | "none";
  confidence: number; // 0-1
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
  longScore: number;
  shortScore: number;
}

export interface MomentumPosition {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  enteredAt: Date;
}

export interface MomentumStats {
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  isRunning: boolean;
  currentPosition: MomentumPosition | null;
}

// ============================================
// Momentum 전략 클래스
// ============================================

export class MomentumStrategy {
  private config: MomentumConfig;
  private currentPosition: MomentumPosition | null = null;
  private lastSignal: MomentumSignal | null = null;
  private isRunning: boolean = false;

  // 성과 지표
  private realizedPnL: number = 0;
  private trades: Array<{
    pnl: number;
    direction: "long" | "short";
    entryPrice: number;
    exitPrice: number;
    closedAt: Date;
  }> = [];

  constructor(config: MomentumConfig) {
    this.config = config;
    this.validateConfig();
  }

  // ============================================
  // 설정 검증
  // ============================================

  private validateConfig(): void {
    const {
      rsiOversold,
      rsiOverbought,
      leverage,
      stopLossPercent,
      takeProfitPercent,
    } = this.config;

    if (rsiOversold < 10 || rsiOversold > 40) {
      throw new Error("rsiOversold must be between 10 and 40");
    }

    if (rsiOverbought < 60 || rsiOverbought > 90) {
      throw new Error("rsiOverbought must be between 60 and 90");
    }

    if (leverage < 1 || leverage > 10) {
      throw new Error("leverage must be between 1 and 10");
    }

    if (stopLossPercent < 1 || stopLossPercent > 10) {
      throw new Error("stopLossPercent must be between 1 and 10");
    }

    if (takeProfitPercent < 2 || takeProfitPercent > 20) {
      throw new Error("takeProfitPercent must be between 2 and 20");
    }
  }

  // ============================================
  // 시그널 생성
  // ============================================

  generateSignal(
    indicators: IndicatorSnapshot,
    currentPrice: number
  ): MomentumSignal {
    const reasons: string[] = [];
    let longScore = 0;
    let shortScore = 0;

    // === LONG 조건 ===

    // 1. RSI 과매도
    if (indicators.rsi < this.config.rsiOversold) {
      longScore += 2;
      reasons.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
    }

    // 2. BB 하단 이탈
    if (indicators.bbPosition === "below_lower") {
      longScore += 2;
      reasons.push("Price below BB lower");
    }

    // 3. ADX 강한 추세 + DI+ > DI-
    if (
      indicators.adx > this.config.adxThreshold &&
      indicators.plusDI > indicators.minusDI
    ) {
      longScore += 1.5;
      reasons.push(`Strong bullish trend (ADX: ${indicators.adx.toFixed(1)})`);
    }

    // 4. EMA 정배열
    if (
      indicators.ema20 > indicators.ema50 &&
      indicators.ema50 > indicators.ema100
    ) {
      longScore += 1;
      reasons.push("EMA bullish alignment");
    }

    // 5. MACD 골든 크로스
    if (indicators.macdCrossover === "bullish") {
      longScore += 1.5;
      reasons.push("MACD bullish crossover");
    }

    // === SHORT 조건 ===

    // 1. RSI 과매수
    if (indicators.rsi > this.config.rsiOverbought) {
      shortScore += 2;
      reasons.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
    }

    // 2. BB 상단 이탈
    if (indicators.bbPosition === "above_upper") {
      shortScore += 2;
      reasons.push("Price above BB upper");
    }

    // 3. ADX 강한 추세 + DI- > DI+
    if (
      indicators.adx > this.config.adxThreshold &&
      indicators.minusDI > indicators.plusDI
    ) {
      shortScore += 1.5;
      reasons.push(`Strong bearish trend (ADX: ${indicators.adx.toFixed(1)})`);
    }

    // 4. EMA 역배열
    if (
      indicators.ema20 < indicators.ema50 &&
      indicators.ema50 < indicators.ema100
    ) {
      shortScore += 1;
      reasons.push("EMA bearish alignment");
    }

    // 5. MACD 데드 크로스
    if (indicators.macdCrossover === "bearish") {
      shortScore += 1.5;
      reasons.push("MACD bearish crossover");
    }

    // === 시그널 결정 ===
    let direction: "long" | "short" | "none" = "none";
    let confidence = 0;

    if (longScore >= 4 && longScore > shortScore * 1.5) {
      direction = "long";
      confidence = Math.min(1, longScore / 8);
    } else if (shortScore >= 4 && shortScore > longScore * 1.5) {
      direction = "short";
      confidence = Math.min(1, shortScore / 8);
    }

    // TP/SL 계산
    const stopLoss =
      direction === "long"
        ? currentPrice * (1 - this.config.stopLossPercent / 100)
        : currentPrice * (1 + this.config.stopLossPercent / 100);

    const takeProfit =
      direction === "long"
        ? currentPrice * (1 + this.config.takeProfitPercent / 100)
        : currentPrice * (1 - this.config.takeProfitPercent / 100);

    const signal: MomentumSignal = {
      direction,
      confidence,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      reasons,
      longScore,
      shortScore,
    };

    this.lastSignal = signal;
    return signal;
  }

  // ============================================
  // 포지션 관리
  // ============================================

  openPosition(signal: MomentumSignal): MomentumPosition | null {
    if (!this.isRunning) return null;
    if (signal.direction === "none") return null;
    if (this.currentPosition) return null; // 이미 포지션이 있음

    const positionSize =
      (this.config.totalCapital * this.config.leverage) / signal.entryPrice;

    this.currentPosition = {
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      symbol: this.config.symbol,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      currentPrice: signal.entryPrice,
      size: positionSize,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      unrealizedPnl: 0,
      enteredAt: new Date(),
    };

    console.log(
      `📈 Momentum ${signal.direction.toUpperCase()} opened @ $${signal.entryPrice.toFixed(2)}`
    );
    console.log(
      `   TP: $${signal.takeProfit.toFixed(2)} | SL: $${signal.stopLoss.toFixed(2)}`
    );
    console.log(`   Confidence: ${(signal.confidence * 100).toFixed(0)}%`);

    return { ...this.currentPosition };
  }

  onPriceUpdate(currentPrice: number): {
    action: "hold" | "tp" | "sl" | "trailing_updated";
    position: MomentumPosition | null;
    closedPnl?: number;
  } {
    if (!this.currentPosition) {
      return { action: "hold", position: null };
    }

    // 현재 가격 및 미실현 PnL 업데이트
    this.currentPosition.currentPrice = currentPrice;
    const priceDiff =
      this.currentPosition.direction === "long"
        ? currentPrice - this.currentPosition.entryPrice
        : this.currentPosition.entryPrice - currentPrice;
    this.currentPosition.unrealizedPnl = this.currentPosition.size * priceDiff;

    // Take Profit 체크
    if (this.currentPosition.direction === "long") {
      if (currentPrice >= this.currentPosition.takeProfit) {
        return this.closePosition(currentPrice, "tp");
      }
      if (currentPrice <= this.currentPosition.stopLoss) {
        return this.closePosition(currentPrice, "sl");
      }
    } else {
      if (currentPrice <= this.currentPosition.takeProfit) {
        return this.closePosition(currentPrice, "tp");
      }
      if (currentPrice >= this.currentPosition.stopLoss) {
        return this.closePosition(currentPrice, "sl");
      }
    }

    // Trailing Stop 업데이트
    const oldSL = this.currentPosition.stopLoss;
    this.currentPosition.stopLoss = this.updateTrailingStop(
      currentPrice,
      this.currentPosition.direction,
      this.currentPosition.stopLoss
    );

    if (this.currentPosition.stopLoss !== oldSL) {
      console.log(
        `📊 Trailing stop updated: $${oldSL.toFixed(2)} → $${this.currentPosition.stopLoss.toFixed(2)}`
      );
      return {
        action: "trailing_updated",
        position: { ...this.currentPosition },
      };
    }

    return { action: "hold", position: { ...this.currentPosition } };
  }

  private closePosition(
    exitPrice: number,
    reason: "tp" | "sl"
  ): {
    action: "tp" | "sl";
    position: MomentumPosition | null;
    closedPnl: number;
  } {
    if (!this.currentPosition) {
      return { action: reason, position: null, closedPnl: 0 };
    }

    const priceDiff =
      this.currentPosition.direction === "long"
        ? exitPrice - this.currentPosition.entryPrice
        : this.currentPosition.entryPrice - exitPrice;
    const pnl = this.currentPosition.size * priceDiff;

    // 거래 기록
    this.trades.push({
      pnl,
      direction: this.currentPosition.direction,
      entryPrice: this.currentPosition.entryPrice,
      exitPrice,
      closedAt: new Date(),
    });

    this.realizedPnL += pnl;

    const emoji = reason === "tp" ? "✅" : "❌";
    console.log(
      `${emoji} Momentum closed (${reason.toUpperCase()}) @ $${exitPrice.toFixed(2)} | PnL: $${pnl.toFixed(2)}`
    );

    this.currentPosition = null;

    return { action: reason, position: null, closedPnl: pnl };
  }

  // ============================================
  // Trailing Stop
  // ============================================

  updateTrailingStop(
    currentPrice: number,
    position: "long" | "short",
    currentSL: number
  ): number {
    const { trailingStopPercent } = this.config;

    if (position === "long") {
      const newSL = currentPrice * (1 - trailingStopPercent / 100);
      return Math.max(currentSL, newSL);
    } else {
      const newSL = currentPrice * (1 + trailingStopPercent / 100);
      return Math.min(currentSL, newSL);
    }
  }

  // ============================================
  // 전략 제어
  // ============================================

  start(): void {
    this.isRunning = true;
    console.log(`▶️ Momentum strategy started for ${this.config.symbol}`);
  }

  stop(): void {
    this.isRunning = false;
    console.log(
      `⏹️ Momentum strategy stopped. Total PnL: $${this.realizedPnL.toFixed(2)}`
    );
  }

  // ============================================
  // 통계
  // ============================================

  getStats(): MomentumStats {
    const wins = this.trades.filter((t) => t.pnl > 0);
    const losses = this.trades.filter((t) => t.pnl <= 0);

    const totalWin = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    const unrealizedPnL = this.currentPosition?.unrealizedPnl || 0;

    return {
      totalPnL: this.realizedPnL + unrealizedPnL,
      realizedPnL: this.realizedPnL,
      unrealizedPnL,
      totalTrades: this.trades.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate: this.trades.length > 0 ? wins.length / this.trades.length : 0,
      averageWin: wins.length > 0 ? totalWin / wins.length : 0,
      averageLoss: losses.length > 0 ? totalLoss / losses.length : 0,
      profitFactor:
        totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0,
      isRunning: this.isRunning,
      currentPosition: this.currentPosition
        ? { ...this.currentPosition }
        : null,
    };
  }

  getConfig(): MomentumConfig {
    return { ...this.config };
  }

  getLastSignal(): MomentumSignal | null {
    return this.lastSignal;
  }

  getCurrentPosition(): MomentumPosition | null {
    return this.currentPosition ? { ...this.currentPosition } : null;
  }
}

// ============================================
// 팩토리 함수
// ============================================

export function createMomentumStrategy(
  config: MomentumConfig
): MomentumStrategy {
  return new MomentumStrategy(config);
}

// 기본 설정
export const DEFAULT_MOMENTUM_CONFIG: Partial<MomentumConfig> = {
  rsiOversold: 30,
  rsiOverbought: 70,
  bbStdDev: 2,
  adxThreshold: 25,
  leverage: 3,
  stopLossPercent: 2,
  takeProfitPercent: 5,
  trailingStopPercent: 2,
};
