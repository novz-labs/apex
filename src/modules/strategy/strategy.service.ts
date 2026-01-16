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
    source: string = "ai"
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

    // 인스턴스 파라미터 업데이트 (새 인스턴스 생성 또는 동적 업데이트)
    // 여기서는 간단히 새 인스턴스로 교체 (상태 유지가 필요한 경우 주의)
    if (instance.type === "grid_bot") {
      instance.strategy = new GridBotStrategy(newParams as GridConfig);
      if (instance.enabled && instance.strategy.initializeGrids)
        instance.strategy.initializeGrids();
    } else if (instance.type === "momentum") {
      instance.strategy = new MomentumStrategy(newParams as MomentumConfig);
      if (instance.enabled) instance.strategy.start();
    }

    return instance;
  }

  getStrategy(id: string) {
    return this.activeStrategies.get(id);
  }

  getAllStrategies() {
    return Array.from(this.activeStrategies.values());
  }
}

export const strategyService = new StrategyService();
