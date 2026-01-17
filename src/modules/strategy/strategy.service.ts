import { prisma } from "@db/prisma";
import { type StrategyType, type TradingStrategy } from "../../types";
import {
  FundingArbStrategy,
  type FundingArbConfig,
} from "./funding-arb.service";
import { GridBotStrategy, type GridConfig } from "./grid-bot.service";
import { MomentumStrategy, type MomentumConfig } from "./momentum.service";
import { ScalpingStrategy, type ScalpingConfig } from "./scalping.service";

export interface StrategyInstance {
  id: string;
  name: string;
  type: string;
  strategy: TradingStrategy;
  enabled: boolean;
  isAgentic: boolean;
  allocation: number; // 자본 배분 %
}

export interface AllocationChange {
  strategyId: string;
  strategyName: string;
  previousAllocation: number;
  newAllocation: number;
}

class StrategyService {
  private activeStrategies = new Map<string, StrategyInstance>();

  /**
   * DB에서 모든 전략을 로드하여 인스턴스화
   */
  async loadStrategies() {
    const dbStrategies = await prisma.strategy.findMany();

    for (const dbEntry of dbStrategies) {
      const params = JSON.parse(dbEntry.paramsJson);
      let strategyInstance: any;

      if (dbEntry.type === "grid_bot") {
        strategyInstance = new GridBotStrategy(params as GridConfig);
      } else if (dbEntry.type === "momentum") {
        strategyInstance = new MomentumStrategy(params as MomentumConfig);
      } else if (dbEntry.type === "scalping") {
        strategyInstance = new ScalpingStrategy(params as ScalpingConfig);
      } else if (dbEntry.type === "funding_arb") {
        strategyInstance = new FundingArbStrategy(params as FundingArbConfig);
      } else {
        console.warn(`Unknown strategy type: ${dbEntry.type}`);
        continue;
      }

      if (dbEntry.enabled) {
        strategyInstance.start();
      }

      this.activeStrategies.set(dbEntry.id, {
        id: dbEntry.id,
        name: dbEntry.name,
        type: dbEntry.type as StrategyType,
        strategy: strategyInstance,
        enabled: dbEntry.enabled,
        isAgentic: dbEntry.isAgentic,
        allocation: dbEntry.allocation ?? 0,
      });
    }

    console.log(`✅ Loaded ${this.activeStrategies.size} strategies from DB`);
  }

  /**
   * 새 전략 생성 및 DB 저장
   */
  async createStrategy(name: string, type: StrategyType, params: any) {
    const dbEntry = await prisma.strategy.create({
      data: {
        name,
        type,
        paramsJson: JSON.stringify(params),
        enabled: false,
        isAgentic: params.isAgentic ?? true, // 기본적으로 에이전트 모드 활성
      },
    });

    // 인스턴스화
    let instance: any;
    if (type === "grid_bot") {
      instance = new GridBotStrategy(params as GridConfig);
    } else if (type === "momentum") {
      instance = new MomentumStrategy(params as MomentumConfig);
    } else if (type === "scalping") {
      instance = new ScalpingStrategy(params as ScalpingConfig);
    } else if (type === "funding_arb") {
      instance = new FundingArbStrategy(params as FundingArbConfig);
    } else {
      throw new Error(`Unsupported strategy type: ${type}`);
    }

    this.activeStrategies.set(dbEntry.id, {
      id: dbEntry.id,
      name: dbEntry.name,
      type,
      strategy: instance,
      enabled: false,
      isAgentic: dbEntry.isAgentic,
      allocation: 0,
    });

    return dbEntry;
  }

  /**
   * 전략 활성화/비활성화
   */
  async toggleStrategy(id: string, enabled: boolean) {
    const instance = this.activeStrategies.get(id);
    if (!instance) throw new Error("Strategy not found");

    await prisma.strategy.update({
      where: { id },
      data: { enabled },
    });

    instance.enabled = enabled;
    if (enabled) {
      instance.strategy.start();
    } else {
      instance.strategy.stop();
    }

    return instance;
  }

  /**
   * 전략 삭제
   */
  async deleteStrategy(id: string) {
    const instance = this.activeStrategies.get(id);
    if (instance) {
      instance.strategy.stop();
    }

    await prisma.strategy.delete({
      where: { id },
    });

    this.activeStrategies.delete(id);
    return { success: true };
  }

  /**
   * 파라미터 업데이트 (AI 추천 등)
   */
  async updateParams(
    id: string,
    newParams: any,
    reason: string,
    source: string = "ai",
  ) {
    const instance = this.activeStrategies.get(id);
    if (!instance) throw new Error("Strategy not found");

    const oldParamsJson = await prisma.strategy.findUnique({
      where: { id },
      select: { paramsJson: true },
    });

    await prisma.$transaction([
      prisma.strategy.update({
        where: { id },
        data: { paramsJson: JSON.stringify(newParams) },
      }),
      prisma.strategyParamHistory.create({
        data: {
          strategyId: id,
          previousParams: oldParamsJson?.paramsJson || "{}",
          newParams: JSON.stringify(newParams),
          changeReason: reason,
          source,
        },
      }),
    ]);

    // 인스턴스 파라미터 업데이트 (새 인스턴스 생성)
    const wasEnabled = instance.enabled;

    switch (instance.type) {
      case "grid_bot":
        instance.strategy = new GridBotStrategy(newParams as GridConfig);
        if (wasEnabled && instance.strategy.initializeGrids) {
          instance.strategy.initializeGrids();
        }
        break;
      case "momentum":
        instance.strategy = new MomentumStrategy(newParams as MomentumConfig);
        if (wasEnabled) instance.strategy.start();
        break;
      case "scalping":
        instance.strategy = new ScalpingStrategy(newParams as ScalpingConfig);
        if (wasEnabled) instance.strategy.start();
        break;
      case "funding_arb":
        instance.strategy = new FundingArbStrategy(
          newParams as FundingArbConfig,
        );
        if (wasEnabled) instance.strategy.start();
        break;
    }

    console.log(`🔄 Strategy params updated: ${instance.name} (${reason})`);
    return instance;
  }

  /**
   * 자본 배분 업데이트
   */
  async updateAllocation(
    allocations: Record<string, number>,
    reason: string,
    source: string = "ai",
  ): Promise<AllocationChange[]> {
    const changes: AllocationChange[] = [];

    // 총 배분이 100%를 넘지 않는지 검증
    const totalAllocation = Object.values(allocations).reduce(
      (sum, v) => sum + v,
      0,
    );
    if (totalAllocation > 100) {
      throw new Error(`Total allocation exceeds 100%: ${totalAllocation}%`);
    }

    for (const [strategyId, newAllocation] of Object.entries(allocations)) {
      const instance = this.activeStrategies.get(strategyId);
      if (!instance) {
        console.warn(`Strategy not found for allocation update: ${strategyId}`);
        continue;
      }

      const previousAllocation = instance.allocation;

      // DB 업데이트
      await prisma.strategy.update({
        where: { id: strategyId },
        data: { allocation: newAllocation },
      });

      // 히스토리 기록
      await prisma.strategyParamHistory.create({
        data: {
          strategyId,
          previousParams: JSON.stringify({ allocation: previousAllocation }),
          newParams: JSON.stringify({ allocation: newAllocation }),
          changeReason: `Allocation change: ${reason}`,
          source,
        },
      });

      // 메모리 업데이트
      instance.allocation = newAllocation;

      changes.push({
        strategyId,
        strategyName: instance.name,
        previousAllocation,
        newAllocation,
      });

      console.log(
        `📊 Allocation changed: ${instance.name} ${previousAllocation}% → ${newAllocation}%`,
      );
    }

    return changes;
  }

  /**
   * 전략별 자본 배분 비율에 따른 실제 자본 계산
   */
  calculateCapitalForStrategy(
    strategyId: string,
    totalCapital: number,
  ): number {
    const instance = this.activeStrategies.get(strategyId);
    if (!instance) return 0;

    return (totalCapital * instance.allocation) / 100;
  }

  /**
   * 모든 전략의 자본 배분 현황 조회
   */
  getAllocationSummary(): {
    strategies: Array<{
      id: string;
      name: string;
      type: string;
      allocation: number;
      enabled: boolean;
    }>;
    totalAllocated: number;
    unallocated: number;
  } {
    const strategies = Array.from(this.activeStrategies.values()).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      allocation: s.allocation,
      enabled: s.enabled,
    }));

    const totalAllocated = strategies.reduce((sum, s) => sum + s.allocation, 0);

    return {
      strategies,
      totalAllocated,
      unallocated: 100 - totalAllocated,
    };
  }

  /**
   * 특정 파라미터만 부분 업데이트 (기존 파라미터 유지)
   */
  async updateParamsPartial(
    id: string,
    partialParams: Record<string, number>,
    reason: string,
    source: string = "ai",
  ) {
    const instance = this.activeStrategies.get(id);
    if (!instance) throw new Error("Strategy not found");

    // 현재 파라미터 조회
    const current = await prisma.strategy.findUnique({
      where: { id },
      select: { paramsJson: true },
    });

    const currentParams = JSON.parse(current?.paramsJson || "{}");

    // 변경사항 적용 (±20% 제한 체크)
    const newParams = { ...currentParams };
    const appliedChanges: Record<string, { from: number; to: number }> = {};

    for (const [key, newValue] of Object.entries(partialParams)) {
      const oldValue = currentParams[key];

      if (oldValue !== undefined && typeof oldValue === "number") {
        // ±20% 제한 적용
        const maxChange = Math.abs(oldValue) * 0.2;
        const clampedValue = Math.max(
          oldValue - maxChange,
          Math.min(oldValue + maxChange, newValue),
        );

        newParams[key] = clampedValue;
        appliedChanges[key] = { from: oldValue, to: clampedValue };

        if (clampedValue !== newValue) {
          console.warn(
            `⚠️ Parameter ${key} clamped: requested ${newValue}, applied ${clampedValue} (±20% limit)`,
          );
        }
      } else {
        // 새 파라미터는 그대로 적용
        newParams[key] = newValue;
        appliedChanges[key] = { from: oldValue ?? 0, to: newValue };
      }
    }

    // 전체 업데이트 실행
    await this.updateParams(id, newParams, reason, source);

    return { appliedChanges, newParams };
  }

  getStrategy(id: string) {
    return this.activeStrategies.get(id);
  }

  getStrategyByName(name: string) {
    return Array.from(this.activeStrategies.values()).find(
      (s) => s.name === name,
    );
  }

  getAllStrategies() {
    return Array.from(this.activeStrategies.values());
  }
}

export const strategyService = new StrategyService();
