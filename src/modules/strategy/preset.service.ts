// src/modules/strategy/preset.service.ts

import type { StrategyType } from "../../types";
import { prisma } from "../db/prisma";

// ============================================
// 타입 정의
// ============================================

export interface PresetParams {
  // Common
  symbol?: string;
  leverage?: number;
  takeProfitPercent?: number;
  stopLossPercent?: number;
  positionSizePercent?: number;

  // Grid Bot specific
  gridCount?: number;
  gridSpacing?: number;
  upperPrice?: number;
  lowerPrice?: number;

  // Momentum specific
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  bollingerPeriod?: number;
  bollingerStdDev?: number;
  adxPeriod?: number;
  adxThreshold?: number;

  // Scalping specific
  stochK?: number;
  stochD?: number;
  maxDailyTrades?: number;

  // FundingArb specific
  minFundingRate?: number;
  minAnnualizedApy?: number;
  maxConcurrentPositions?: number;
}

export interface Preset {
  id: string;
  name: string;
  strategyType: string;
  symbol: string;
  params: PresetParams;
  description?: string;
  avgReturn: number;
  avgWinRate: number;
  aiConfidence: number;
  isDefault: boolean;
}

// ============================================
// 기본 프리셋 정의
// ============================================

const DEFAULT_PRESETS: Array<{
  name: string;
  strategyType: StrategyType;
  symbol: string;
  params: PresetParams;
  description: string;
}> = [
  // Momentum - 권장
  {
    name: "recommended",
    strategyType: "momentum",
    symbol: "*",
    description: "중간 리스크, 균형잡힌 설정",
    params: {
      leverage: 3,
      takeProfitPercent: 2.0,
      stopLossPercent: 1.0,
      positionSizePercent: 10,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
      bollingerPeriod: 20,
      bollingerStdDev: 2,
      adxPeriod: 14,
      adxThreshold: 25,
    },
  },
  // Momentum - 보수적
  {
    name: "conservative",
    strategyType: "momentum",
    symbol: "*",
    description: "낮은 레버리지, 넓은 SL",
    params: {
      leverage: 2,
      takeProfitPercent: 2.0, // 최소 2%
      stopLossPercent: 1.5,
      positionSizePercent: 5,
      rsiPeriod: 14,
      rsiOverbought: 75,
      rsiOversold: 25,
      adxThreshold: 30,
    },
  },
  // Momentum - 공격적
  {
    name: "aggressive",
    strategyType: "momentum",
    symbol: "*",
    description: "높은 레버리지, 좁은 TP/SL",
    params: {
      leverage: 5,
      takeProfitPercent: 3.0,
      stopLossPercent: 1.0, // 최소 1%
      positionSizePercent: 15,
      rsiPeriod: 10,
      rsiOverbought: 65,
      rsiOversold: 35,
      adxThreshold: 20,
    },
  },
  // Grid Bot - 권장
  {
    name: "recommended",
    strategyType: "grid_bot",
    symbol: "*",
    description: "표준 그리드 설정",
    params: {
      gridCount: 10,
      gridSpacing: 1.0, // %
      leverage: 2,
      positionSizePercent: 30,
      stopLossPercent: 10,
    },
  },
  // Scalping - 권장
  {
    name: "recommended",
    strategyType: "scalping",
    symbol: "*",
    description: "빠른 진입/청산, 낮은 리스크",
    params: {
      leverage: 3,
      takeProfitPercent: 2.0, // 최소 2% (스키마 제약)
      stopLossPercent: 1.0, // 최소 1% (스키마 제약)
      positionSizePercent: 5,
      rsiPeriod: 7,
      rsiOverbought: 80,
      rsiOversold: 20,
      stochK: 14,
      stochD: 3,
      maxDailyTrades: 20,
    },
  },
  // FundingArb - 권장
  {
    name: "recommended",
    strategyType: "funding_arb",
    symbol: "*",
    description: "안정적 펀딩비 수익",
    params: {
      leverage: 2,
      minFundingRate: 0.01, // 0.01%
      minAnnualizedApy: 10, // 10%
      maxConcurrentPositions: 3,
      positionSizePercent: 20,
    },
  },
];

// ============================================
// 프리셋 서비스
// ============================================

class PresetService {
  /**
   * 기본 프리셋 시드
   */
  async seedDefaultPresets(): Promise<number> {
    let seeded = 0;

    for (const preset of DEFAULT_PRESETS) {
      try {
        await prisma.strategyPreset.upsert({
          where: {
            name_strategyType_symbol: {
              name: preset.name,
              strategyType: preset.strategyType,
              symbol: preset.symbol,
            },
          },
          update: {}, // 이미 있으면 업데이트 안 함
          create: {
            name: preset.name,
            strategyType: preset.strategyType,
            symbol: preset.symbol,
            paramsJson: JSON.stringify(preset.params),
            description: preset.description,
            isDefault: preset.name === "recommended",
          },
        });
        seeded++;
      } catch (error) {
        // 이미 존재하면 무시
      }
    }

    console.log(`📋 Seeded ${seeded} default presets`);
    return seeded;
  }

  /**
   * 프리셋 조회
   */
  async getPreset(
    strategyType: StrategyType,
    presetName: string = "recommended",
    symbol: string = "*"
  ): Promise<Preset | null> {
    // 심볼 특화 프리셋 먼저 찾기
    let preset = await prisma.strategyPreset.findUnique({
      where: {
        name_strategyType_symbol: {
          name: presetName,
          strategyType,
          symbol,
        },
      },
    });

    // 없으면 범용 프리셋 찾기
    if (!preset && symbol !== "*") {
      preset = await prisma.strategyPreset.findUnique({
        where: {
          name_strategyType_symbol: {
            name: presetName,
            strategyType,
            symbol: "*",
          },
        },
      });
    }

    if (!preset) return null;

    return {
      id: preset.id,
      name: preset.name,
      strategyType: preset.strategyType,
      symbol: preset.symbol,
      params: JSON.parse(preset.paramsJson),
      description: preset.description ?? undefined,
      avgReturn: preset.avgReturn,
      avgWinRate: preset.avgWinRate,
      aiConfidence: preset.aiConfidence,
      isDefault: preset.isDefault,
    };
  }

  /**
   * 전략 타입별 모든 프리셋 조회
   */
  async getPresetsByType(strategyType: StrategyType): Promise<Preset[]> {
    const presets = await prisma.strategyPreset.findMany({
      where: { strategyType },
      orderBy: { name: "asc" },
    });

    return presets.map((p) => ({
      id: p.id,
      name: p.name,
      strategyType: p.strategyType,
      symbol: p.symbol,
      params: JSON.parse(p.paramsJson),
      description: p.description ?? undefined,
      avgReturn: p.avgReturn,
      avgWinRate: p.avgWinRate,
      aiConfidence: p.aiConfidence,
      isDefault: p.isDefault,
    }));
  }

  /**
   * 백테스트 결과로 프리셋 업데이트
   */
  async updatePresetFromBacktest(
    presetId: string,
    result: { totalReturnPercent: number; winRate: number }
  ): Promise<void> {
    const preset = await prisma.strategyPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset) return;

    // 이동 평균으로 업데이트
    const newCount = preset.backtestCount + 1;
    const newAvgReturn =
      (preset.avgReturn * preset.backtestCount + result.totalReturnPercent) /
      newCount;
    const newAvgWinRate =
      (preset.avgWinRate * preset.backtestCount + result.winRate) / newCount;

    await prisma.strategyPreset.update({
      where: { id: presetId },
      data: {
        backtestCount: newCount,
        avgReturn: newAvgReturn,
        avgWinRate: newAvgWinRate,
      },
    });

    console.log(
      `📊 Updated preset ${preset.name}: avgReturn=${newAvgReturn.toFixed(2)}%, winRate=${(newAvgWinRate * 100).toFixed(1)}%`
    );
  }

  /**
   * AI에 의한 프리셋 최적화
   */
  async optimizePreset(
    presetId: string,
    newParams: PresetParams,
    aiConfidence: number
  ): Promise<void> {
    const preset = await prisma.strategyPreset.findUnique({
      where: { id: presetId },
    });

    if (!preset) return;

    // 기존 파라미터와 병합
    const currentParams = JSON.parse(preset.paramsJson);
    const mergedParams = { ...currentParams, ...newParams };

    await prisma.strategyPreset.update({
      where: { id: presetId },
      data: {
        paramsJson: JSON.stringify(mergedParams),
        aiConfidence,
        lastOptimized: new Date(),
      },
    });

    console.log(
      `🤖 AI optimized preset ${preset.name} (confidence: ${aiConfidence})`
    );
  }

  /**
   * 프리셋 생성
   */
  async createPreset(data: {
    name: string;
    strategyType: StrategyType;
    symbol: string;
    params: PresetParams;
    description?: string;
  }): Promise<Preset> {
    const preset = await prisma.strategyPreset.create({
      data: {
        name: data.name,
        strategyType: data.strategyType,
        symbol: data.symbol,
        paramsJson: JSON.stringify(data.params),
        description: data.description,
      },
    });

    return {
      id: preset.id,
      name: preset.name,
      strategyType: preset.strategyType,
      symbol: preset.symbol,
      params: data.params,
      description: data.description,
      avgReturn: 0,
      avgWinRate: 0,
      aiConfidence: 0.5,
      isDefault: false,
    };
  }
}

export const presetService = new PresetService();
