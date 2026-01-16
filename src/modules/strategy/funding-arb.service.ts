// src/modules/strategy/funding-arb.service.ts

import { type StrategyStats, type TradingStrategy } from "../../types";

// ============================================
// 타입 정의
// ============================================

export interface FundingArbConfig {
  symbols: string[]; // 모니터링할 심볼들
  minFundingRate: number; // 최소 펀딩비 (0.01% = 0.0001)
  minAnnualizedAPY: number; // 최소 연환산 수익률 (%)
  maxConcurrentPositions: number; // 최대 동시 포지션 수
  positionSizePercent: number; // 자본 대비 포지션 크기 (%)
  leverage: number;
  totalCapital: number;

  // 리스크 관리
  maxDrawdownPercent: number; // 최대 드로다운 (포지션 종료)
  stopOnDirectionChange: boolean; // 펀딩 방향 변경 시 종료
  minHoldingPeriods: number; // 최소 홀딩 펀딩 주기 (8시간 단위)
}

export interface FundingPosition {
  id: string;
  symbol: string;
  side: "long" | "short"; // 펀딩 받는 방향
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  fundingRate: number; // 진입 시 펀딩비
  currentFundingRate: number;
  accumulatedFunding: number; // 누적 펀딩 수령액
  fundingPayments: FundingPayment[];
  unrealizedPnl: number;
  totalPnl: number; // 펀딩 + 미실현 PnL
  openTime: Date;
  periodsHeld: number; // 홀딩한 펀딩 주기 수
}

export interface FundingPayment {
  timestamp: Date;
  rate: number;
  amount: number;
}

export interface FundingOpportunity {
  symbol: string;
  fundingRate: number;
  annualizedAPY: number;
  recommendedSide: "long" | "short";
  nextFundingTime: Date;
  confidence: number;
}

export interface FundingArbStats extends StrategyStats {
  activePositions: number;
  totalFundingCollected: number;
  averageAPY: number;
  positions: FundingPosition[];
  opportunities: FundingOpportunity[];
}

// ============================================
// Funding Arb 전략 클래스
// ============================================

export class FundingArbStrategy implements TradingStrategy {
  private config: FundingArbConfig;
  private isRunning: boolean = false;
  private positions: Map<string, FundingPosition> = new Map();

  // 통계
  private totalFundingCollected: number = 0;
  private totalRealizedPnl: number = 0;
  private closedPositions: FundingPosition[] = [];

  constructor(config: FundingArbConfig) {
    this.config = this.validateConfig(config);
  }

  // ============================================
  // 설정 검증
  // ============================================

  private validateConfig(config: FundingArbConfig): FundingArbConfig {
    if (config.minFundingRate < 0.00001 || config.minFundingRate > 0.01) {
      throw new Error("minFundingRate must be between 0.00001 and 0.01");
    }

    if (config.maxConcurrentPositions < 1 || config.maxConcurrentPositions > 10) {
      throw new Error("maxConcurrentPositions must be between 1 and 10");
    }

    if (config.leverage < 1 || config.leverage > 5) {
      throw new Error("leverage for funding arb should be between 1 and 5 (low risk)");
    }

    return config;
  }

  // ============================================
  // 펀딩비 기회 분석
  // ============================================

  analyzeFundingOpportunity(
    symbol: string,
    fundingRate: number,
    nextFundingTime: Date
  ): FundingOpportunity | null {
    const absRate = Math.abs(fundingRate);

    // 최소 펀딩비 체크
    if (absRate < this.config.minFundingRate) {
      return null;
    }

    // 연환산 APY 계산 (Hyperliquid: 1시간마다 펀딩)
    // APY = hourlyRate * 24 * 365 * 100
    const annualizedAPY = absRate * 24 * 365 * 100;

    if (annualizedAPY < this.config.minAnnualizedAPY) {
      return null;
    }

    // 진입 방향 결정
    // 펀딩비 양수(+) = Long이 Short에게 지불 → Short 진입 (펀딩 수령)
    // 펀딩비 음수(-) = Short이 Long에게 지불 → Long 진입 (펀딩 수령)
    const recommendedSide: "long" | "short" = fundingRate > 0 ? "short" : "long";

    // 신뢰도 계산 (펀딩비가 높을수록 높은 신뢰도)
    const confidence = Math.min(1, absRate / 0.001); // 0.1%를 기준으로

    return {
      symbol,
      fundingRate,
      annualizedAPY,
      recommendedSide,
      nextFundingTime,
      confidence,
    };
  }

  // ============================================
  // 포지션 열기
  // ============================================

  openPosition(opportunity: FundingOpportunity, currentPrice: number): FundingPosition | null {
    if (!this.isRunning) return null;

    // 이미 해당 심볼에 포지션이 있는지 체크
    if (this.positions.has(opportunity.symbol)) {
      console.log(`⚠️ Position already exists for ${opportunity.symbol}`);
      return null;
    }

    // 최대 동시 포지션 체크
    if (this.positions.size >= this.config.maxConcurrentPositions) {
      console.log(`⚠️ Max concurrent positions reached (${this.config.maxConcurrentPositions})`);
      return null;
    }

    // 포지션 크기 계산
    const positionValue =
      (this.config.totalCapital * this.config.positionSizePercent / 100) *
      this.config.leverage;
    const size = positionValue / currentPrice;

    const position: FundingPosition = {
      id: `funding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      symbol: opportunity.symbol,
      side: opportunity.recommendedSide,
      entryPrice: currentPrice,
      currentPrice,
      size,
      leverage: this.config.leverage,
      fundingRate: opportunity.fundingRate,
      currentFundingRate: opportunity.fundingRate,
      accumulatedFunding: 0,
      fundingPayments: [],
      unrealizedPnl: 0,
      totalPnl: 0,
      openTime: new Date(),
      periodsHeld: 0,
    };

    this.positions.set(opportunity.symbol, position);

    console.log(`💰 Funding Arb opened: ${opportunity.symbol} ${opportunity.recommendedSide.toUpperCase()}`);
    console.log(`   Entry: $${currentPrice.toFixed(2)} | Size: ${size.toFixed(6)}`);
    console.log(`   Funding Rate: ${(opportunity.fundingRate * 100).toFixed(4)}%`);
    console.log(`   Annualized APY: ${opportunity.annualizedAPY.toFixed(2)}%`);

    return { ...position };
  }

  // ============================================
  // 펀딩비 수령 기록
  // ============================================

  recordFundingPayment(symbol: string, fundingRate: number): FundingPayment | null {
    const position = this.positions.get(symbol);
    if (!position) return null;

    // 펀딩 금액 계산
    // 포지션 가치 * 펀딩비 (받는 방향이면 +, 내는 방향이면 -)
    const positionValue = position.size * position.currentPrice;
    let fundingAmount: number;

    if (position.side === "short" && fundingRate > 0) {
      // Short이고 펀딩비 양수 → 펀딩 수령
      fundingAmount = positionValue * Math.abs(fundingRate);
    } else if (position.side === "long" && fundingRate < 0) {
      // Long이고 펀딩비 음수 → 펀딩 수령
      fundingAmount = positionValue * Math.abs(fundingRate);
    } else {
      // 펀딩 지불 (방향이 바뀜)
      fundingAmount = -positionValue * Math.abs(fundingRate);
    }

    const payment: FundingPayment = {
      timestamp: new Date(),
      rate: fundingRate,
      amount: fundingAmount,
    };

    position.fundingPayments.push(payment);
    position.accumulatedFunding += fundingAmount;
    position.currentFundingRate = fundingRate;
    position.periodsHeld++;
    position.totalPnl = position.accumulatedFunding + position.unrealizedPnl;

    this.totalFundingCollected += fundingAmount;

    const emoji = fundingAmount >= 0 ? "💵" : "💸";
    console.log(`${emoji} Funding ${fundingAmount >= 0 ? "received" : "paid"}: ${symbol}`);
    console.log(`   Amount: $${fundingAmount.toFixed(4)} | Total: $${position.accumulatedFunding.toFixed(4)}`);

    return payment;
  }

  // ============================================
  // 가격 업데이트
  // ============================================

  onPriceUpdate(currentPrice: number): {
    action: "none" | "updated";
    positions: FundingPosition[];
  } {
    if (!this.isRunning) {
      return { action: "none", positions: [] };
    }

    const updatedPositions: FundingPosition[] = [];

    for (const [, position] of this.positions) {
      // 미실현 PnL 계산
      const priceDiff =
        position.side === "long"
          ? currentPrice - position.entryPrice
          : position.entryPrice - currentPrice;

      position.currentPrice = currentPrice;
      position.unrealizedPnl = position.size * priceDiff;
      position.totalPnl = position.accumulatedFunding + position.unrealizedPnl;

      updatedPositions.push({ ...position });
    }

    return { action: "updated", positions: updatedPositions };
  }

  // ============================================
  // 포지션 종료 조건 체크
  // ============================================

  shouldClosePosition(
    symbol: string,
    currentFundingRate: number
  ): { shouldClose: boolean; reason: string } {
    const position = this.positions.get(symbol);
    if (!position) {
      return { shouldClose: false, reason: "Position not found" };
    }

    // 1. 펀딩 방향 변경 체크
    if (this.config.stopOnDirectionChange) {
      const wasPositive = position.fundingRate > 0;
      const isNowPositive = currentFundingRate > 0;

      if (wasPositive !== isNowPositive) {
        return {
          shouldClose: true,
          reason: `Funding direction changed (${position.fundingRate > 0 ? "+" : "-"} → ${currentFundingRate > 0 ? "+" : "-"})`,
        };
      }
    }

    // 2. 펀딩비가 너무 낮아지면 종료
    if (Math.abs(currentFundingRate) < this.config.minFundingRate * 0.3) {
      return {
        shouldClose: true,
        reason: `Funding rate too low: ${(currentFundingRate * 100).toFixed(4)}%`,
      };
    }

    // 3. 드로다운 체크 (펀딩 수익 포함)
    const positionValue =
      (this.config.totalCapital * this.config.positionSizePercent) / 100;
    const drawdownPercent = (-position.totalPnl / positionValue) * 100;

    if (drawdownPercent > this.config.maxDrawdownPercent) {
      return {
        shouldClose: true,
        reason: `Max drawdown reached: ${drawdownPercent.toFixed(2)}%`,
      };
    }

    // 4. 최소 홀딩 기간 도달 & 수익 실현
    if (
      position.periodsHeld >= this.config.minHoldingPeriods &&
      position.totalPnl > 0
    ) {
      // 펀딩이 약해지고 있으면 수익 실현
      if (Math.abs(currentFundingRate) < Math.abs(position.fundingRate) * 0.5) {
        return {
          shouldClose: true,
          reason: `Taking profit after ${position.periodsHeld} periods (funding weakening)`,
        };
      }
    }

    return { shouldClose: false, reason: "Conditions not met" };
  }

  // ============================================
  // 포지션 종료
  // ============================================

  closePosition(symbol: string, exitPrice: number, reason: string): FundingPosition | null {
    const position = this.positions.get(symbol);
    if (!position) return null;

    // 최종 PnL 계산
    const priceDiff =
      position.side === "long"
        ? exitPrice - position.entryPrice
        : position.entryPrice - exitPrice;
    const tradingPnl = position.size * priceDiff;
    const totalPnl = position.accumulatedFunding + tradingPnl;

    position.currentPrice = exitPrice;
    position.unrealizedPnl = tradingPnl;
    position.totalPnl = totalPnl;

    // 통계 업데이트
    this.totalRealizedPnl += totalPnl;
    this.closedPositions.push({ ...position });
    this.positions.delete(symbol);

    const emoji = totalPnl >= 0 ? "✅" : "❌";
    const holdingHours = position.periodsHeld; // Hyperliquid는 1시간마다 펀딩

    console.log(`${emoji} Funding Arb closed: ${symbol}`);
    console.log(`   Exit: $${exitPrice.toFixed(2)} | Holding: ${holdingHours}h`);
    console.log(`   Funding collected: $${position.accumulatedFunding.toFixed(4)}`);
    console.log(`   Trading PnL: $${tradingPnl.toFixed(4)}`);
    console.log(`   Total PnL: $${totalPnl.toFixed(4)}`);
    console.log(`   Reason: ${reason}`);

    return { ...position };
  }

  // ============================================
  // 전략 제어
  // ============================================

  start(): void {
    this.isRunning = true;
    console.log(`💰 Funding Arb Strategy started`);
    console.log(`   Symbols: ${this.config.symbols.join(", ")}`);
    console.log(`   Min funding rate: ${(this.config.minFundingRate * 100).toFixed(4)}%`);
    console.log(`   Max concurrent positions: ${this.config.maxConcurrentPositions}`);
  }

  stop(): void {
    this.isRunning = false;
    console.log(`🛑 Funding Arb Strategy stopped`);
    console.log(`   Active positions: ${this.positions.size}`);
    console.log(`   Total funding collected: $${this.totalFundingCollected.toFixed(4)}`);
    console.log(`   Total realized PnL: $${this.totalRealizedPnl.toFixed(4)}`);
  }

  // ============================================
  // 유틸리티
  // ============================================

  /**
   * 연환산 APY 계산
   */
  calculateAPY(fundingRate: number): number {
    // Hyperliquid: 1시간마다 펀딩
    return Math.abs(fundingRate) * 24 * 365 * 100;
  }

  /**
   * 다음 펀딩 시간 계산 (Hyperliquid 기준)
   */
  getNextFundingTime(): Date {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    return nextHour;
  }

  /**
   * 포지션 조회
   */
  getPosition(symbol: string): FundingPosition | null {
    const position = this.positions.get(symbol);
    return position ? { ...position } : null;
  }

  /**
   * 모든 포지션 조회
   */
  getAllPositions(): FundingPosition[] {
    return Array.from(this.positions.values()).map((p) => ({ ...p }));
  }

  // ============================================
  // 통계 조회
  // ============================================

  getStats(): FundingArbStats {
    const positions = this.getAllPositions();

    // 현재 활성 포지션들의 평균 APY
    const activeAPYs = positions.map((p) => this.calculateAPY(p.currentFundingRate));
    const averageAPY =
      activeAPYs.length > 0
        ? activeAPYs.reduce((a, b) => a + b, 0) / activeAPYs.length
        : 0;

    // 총 PnL (미실현 포함)
    const unrealizedPnl = positions.reduce((sum, p) => sum + p.totalPnl, 0);
    const totalPnl = this.totalRealizedPnl + unrealizedPnl;

    // 승률 계산
    const closedWins = this.closedPositions.filter((p) => p.totalPnl > 0);
    const winRate =
      this.closedPositions.length > 0
        ? closedWins.length / this.closedPositions.length
        : 0;

    return {
      totalTrades: this.closedPositions.length + positions.length,
      wins: closedWins.length,
      losses: this.closedPositions.length - closedWins.length,
      pnl: totalPnl,
      totalPnL: totalPnl,
      realizedPnL: this.totalRealizedPnl,
      unrealizedPnL: unrealizedPnl,
      winRate,
      isRunning: this.isRunning,

      // Funding Arb 전용
      activePositions: positions.length,
      totalFundingCollected: this.totalFundingCollected,
      averageAPY,
      positions,
      opportunities: [], // 별도로 업데이트 필요
    };
  }

  getConfig(): FundingArbConfig {
    return { ...this.config };
  }
}

// ============================================
// 팩토리 함수 & 기본 설정
// ============================================

export function createFundingArbStrategy(config: FundingArbConfig): FundingArbStrategy {
  return new FundingArbStrategy(config);
}

export const DEFAULT_FUNDING_ARB_CONFIG: Partial<FundingArbConfig> = {
  minFundingRate: 0.0001, // 0.01%
  minAnnualizedAPY: 10, // 최소 10% APY
  maxConcurrentPositions: 3,
  positionSizePercent: 30, // 자본의 30%
  leverage: 2,
  maxDrawdownPercent: 5,
  stopOnDirectionChange: true,
  minHoldingPeriods: 3, // 최소 3시간 (3 펀딩 주기)
};
