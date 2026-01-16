# 📊 외부 데이터 서비스 & 크론 스케줄러 설계

> 외부 API 연동, 데이터 캐싱, 스케줄 작업 관리 아키텍처

## 🎯 목표

1. **외부 데이터 수집**: CoinGecko, DeFiLlama, Fear & Greed Index 등
2. **자동화된 작업**: 캔들 수집, 지표 계산, 센티먼트 업데이트
3. **효율적인 캐싱**: DB 기반 캐시로 Rate Limit 준수 및 영속성 확보

---

## 🏗️ 디렉토리 구조

```
src/
├── services/
│   └── external/                      # 외부 API 클라이언트
│       ├── base.service.ts            # 공통 HTTP 클라이언트 & 캐시 로직
│       ├── coingecko.service.ts       # CoinGecko API
│       ├── defillama.service.ts       # DeFiLlama API
│       ├── sentiment.service.ts       # Fear & Greed Index (Alternative.me)
│       ├── serpapi.service.ts         # Google Trends (옵션)
│       └── index.ts                   # 통합 export
│
├── jobs/                              # 크론 작업
│   ├── scheduler.ts                   # 스케줄러 메인 (모든 Job 등록)
│   ├── base.job.ts                    # Job 베이스 클래스
│   ├── candle-collector.job.ts        # 캔들 데이터 수집
│   ├── indicator-updater.job.ts       # 기술 지표 계산 & 저장
│   ├── sentiment-updater.job.ts       # 센티먼트 데이터 업데이트
│   ├── position-monitor.job.ts        # 포지션 TP/SL 모니터링
│   ├── daily-snapshot.job.ts          # 일일 계정 스냅샷
│   ├── funding-collector.job.ts       # 펀딩비 수집
│   └── ai-trigger.job.ts              # AI 분석 트리거 체크
│
├── lib/
│   └── cache.ts                       # DB 캐시 유틸리티
│
└── types/
    └── jobs.ts                        # Job 관련 타입 정의
```

---

## 🔌 외부 API 서비스

### API 목록 및 Rate Limit

| 서비스             | 용도           | Rate Limit | 캐시 TTL | 우선순위 |
| ------------------ | -------------- | ---------- | -------- | -------- |
| **CoinGecko**      | 가격, MC, 볼륨 | 30/min     | 1분      | 🔴 필수  |
| **DeFiLlama**      | TVL, Yields    | 무제한     | 5분      | 🟡 권장  |
| **Alternative.me** | Fear & Greed   | 무제한     | 1시간    | 🔴 필수  |
| **SerpApi**        | Google Trends  | 100/월     | 24시간   | 🟢 옵션  |
| **Hyperliquid**    | 펀딩비, 가격   | 높음       | 1분      | 🔴 필수  |

### Base Service 패턴

```typescript
// services/external/base.service.ts

import { prisma } from "@/lib/prisma";

export abstract class BaseExternalService {
  protected abstract source: string;

  /**
   * 캐시된 데이터를 조회하거나, 없으면 fetch 후 캐시
   */
  protected async getCached<T>(
    dataType: string,
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    // 1. 캐시 조회
    const cached = await prisma.externalDataCache.findUnique({
      where: {
        source_dataType_key: {
          source: this.source,
          dataType,
          key,
        },
      },
    });

    // 2. 캐시 유효성 체크
    if (cached && new Date() < cached.expiresAt) {
      return JSON.parse(cached.dataJson) as T;
    }

    // 3. 새로 fetch
    const data = await fetcher();

    // 4. 캐시 저장 (upsert)
    await prisma.externalDataCache.upsert({
      where: {
        source_dataType_key: {
          source: this.source,
          dataType,
          key,
        },
      },
      update: {
        dataJson: JSON.stringify(data),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
      create: {
        source: this.source,
        dataType,
        key,
        dataJson: JSON.stringify(data),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });

    return data;
  }

  /**
   * Rate limit을 고려한 fetch
   */
  protected async safeFetch<T>(url: string, options?: RequestInit): Promise<T> {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return res.json() as Promise<T>;
    } catch (error) {
      console.error(`[${this.source}] Fetch error:`, error);
      throw error;
    }
  }
}
```

### CoinGecko 서비스 예시

```typescript
// services/external/coingecko.service.ts

import { BaseExternalService } from "./base.service";

const BASE_URL = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 60; // 1분

interface CoinPrice {
  usd: number;
  usd_market_cap: number;
  usd_24h_vol: number;
  usd_24h_change: number;
}

export class CoinGeckoService extends BaseExternalService {
  protected source = "coingecko";

  async getPrices(coinIds: string[]): Promise<Record<string, CoinPrice>> {
    const key = coinIds.sort().join(",");

    return this.getCached(
      "price",
      key,
      async () => {
        const url = `${BASE_URL}/simple/price?ids=${key}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;
        return this.safeFetch<Record<string, CoinPrice>>(url);
      },
      CACHE_TTL
    );
  }

  async getCoinDetails(coinId: string): Promise<{
    fdv: number;
    marketCap: number;
    circulatingSupply: number;
    totalSupply: number;
  }> {
    return this.getCached(
      "details",
      coinId,
      async () => {
        const url = `${BASE_URL}/coins/${coinId}`;
        const data = await this.safeFetch<any>(url);

        return {
          fdv: data.market_data?.fully_diluted_valuation?.usd || 0,
          marketCap: data.market_data?.market_cap?.usd || 0,
          circulatingSupply: data.market_data?.circulating_supply || 0,
          totalSupply: data.market_data?.total_supply || 0,
        };
      },
      CACHE_TTL * 5 // 5분
    );
  }
}

export const coinGeckoService = new CoinGeckoService();
```

### Fear & Greed 서비스 예시

```typescript
// services/external/sentiment.service.ts

import { BaseExternalService } from "./base.service";
import { prisma } from "@/lib/prisma";

const FEAR_GREED_URL = "https://api.alternative.me/fng/";
const CACHE_TTL = 3600; // 1시간

interface FearGreedResponse {
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
  }>;
}

export class SentimentService extends BaseExternalService {
  protected source = "alternative_me";

  async getFearGreedIndex(): Promise<{
    value: number;
    classification: string;
    marketPhase: string;
  }> {
    const data = await this.getCached(
      "fear_greed",
      "current",
      async () => {
        const res = await this.safeFetch<FearGreedResponse>(
          `${FEAR_GREED_URL}?limit=1`
        );
        return res.data[0];
      },
      CACHE_TTL
    );

    const value = parseInt(data.value);

    return {
      value,
      classification: data.value_classification,
      marketPhase: this.calculateMarketPhase(value),
    };
  }

  private calculateMarketPhase(value: number): string {
    if (value < 25) return "accumulate";
    if (value < 50) return "hold";
    if (value < 75) return "reduce";
    return "exit";
  }

  /**
   * 센티먼트 데이터를 DB에 저장 (히스토리용)
   */
  async saveSentimentSnapshot(): Promise<void> {
    const sentiment = await this.getFearGreedIndex();

    await prisma.sentimentData.create({
      data: {
        fearGreedIndex: sentiment.value,
        fearGreedClass: sentiment.classification,
        sentimentScore: sentiment.value, // 단순화
        marketPhase: sentiment.marketPhase,
      },
    });
  }
}

export const sentimentService = new SentimentService();
```

---

## ⏰ 크론 스케줄러

### 스케줄 요약

| Job                | Cron 표현식    | 주기       | 설명                |
| ------------------ | -------------- | ---------- | ------------------- |
| `CandleCollector`  | `* * * * *`    | 매 1분     | 캔들 데이터 수집    |
| `IndicatorUpdater` | `* * * * *`    | 매 1분     | 기술 지표 계산      |
| `PositionMonitor`  | `*/5 * * * *`  | 매 5분     | TP/SL 체크          |
| `SentimentUpdater` | `0 * * * *`    | 매 시간    | 센티먼트 업데이트   |
| `FundingCollector` | `0 */8 * * *`  | 매 8시간   | 펀딩비 수집         |
| `DailySnapshot`    | `0 0 * * *`    | 매일 00:00 | 일일 스냅샷         |
| `AITriggerCheck`   | `*/10 * * * *` | 매 10분    | AI 분석 트리거 체크 |

### 스케줄러 구현

```typescript
// jobs/scheduler.ts

import { Cron } from "croner";
import { CandleCollectorJob } from "./candle-collector.job";
import { SentimentUpdaterJob } from "./sentiment-updater.job";
import { PositionMonitorJob } from "./position-monitor.job";
import { DailySnapshotJob } from "./daily-snapshot.job";

interface ScheduledJob {
  name: string;
  cron: Cron;
  lastRun?: Date;
  lastError?: string;
}

class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private isRunning = false;

  start(): void {
    if (this.isRunning) {
      console.warn("⚠️ Scheduler already running");
      return;
    }

    console.log("🚀 Starting scheduler...");

    // 매 1분: 캔들 수집
    this.register("candle-collector", "* * * * *", async () => {
      await CandleCollectorJob.run();
    });

    // 매 5분: 포지션 모니터링
    this.register("position-monitor", "*/5 * * * *", async () => {
      await PositionMonitorJob.run();
    });

    // 매 시간: 센티먼트 업데이트
    this.register("sentiment-updater", "0 * * * *", async () => {
      await SentimentUpdaterJob.run();
    });

    // 매일 00:00: 일일 스냅샷
    this.register("daily-snapshot", "0 0 * * *", async () => {
      await DailySnapshotJob.run();
    });

    this.isRunning = true;
    console.log(`✅ Scheduler started with ${this.jobs.size} jobs`);
  }

  stop(): void {
    for (const [name, job] of this.jobs) {
      job.cron.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    }
    this.jobs.clear();
    this.isRunning = false;
    console.log("🛑 Scheduler stopped");
  }

  private register(
    name: string,
    pattern: string,
    handler: () => Promise<void>
  ): void {
    const cron = new Cron(pattern, async () => {
      const job = this.jobs.get(name);
      if (!job) return;

      console.log(`⏰ [${name}] Running...`);
      const startTime = Date.now();

      try {
        await handler();
        job.lastRun = new Date();
        job.lastError = undefined;
        console.log(`✅ [${name}] Completed in ${Date.now() - startTime}ms`);
      } catch (error) {
        job.lastError = String(error);
        console.error(`❌ [${name}] Failed:`, error);
      }
    });

    this.jobs.set(name, { name, cron });
    console.log(`📅 Registered job: ${name} (${pattern})`);
  }

  getStatus(): Array<{
    name: string;
    nextRun: Date | null;
    lastRun?: Date;
    lastError?: string;
  }> {
    return Array.from(this.jobs.values()).map((job) => ({
      name: job.name,
      nextRun: job.cron.nextRun(),
      lastRun: job.lastRun,
      lastError: job.lastError,
    }));
  }
}

export const scheduler = new Scheduler();
```

### Base Job 패턴

```typescript
// jobs/base.job.ts

export abstract class BaseJob {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Job 실행 메인 로직
   */
  abstract execute(): Promise<void>;

  /**
   * 에러 핸들링이 포함된 run 메서드
   */
  static async run(): Promise<void> {
    const instance = new (this as any)();

    try {
      await instance.execute();
    } catch (error) {
      console.error(`[${instance.name}] Job failed:`, error);
      // 선택: 에러를 DB에 로깅
      throw error;
    }
  }
}
```

### 센티먼트 업데이터 Job 예시

```typescript
// jobs/sentiment-updater.job.ts

import { BaseJob } from "./base.job";
import { sentimentService } from "@/services/external/sentiment.service";

export class SentimentUpdaterJob extends BaseJob {
  readonly name = "SentimentUpdater";
  readonly description = "Fear & Greed Index 및 센티먼트 데이터 업데이트";

  async execute(): Promise<void> {
    // 1. F&G Index 조회 (캐시 갱신)
    const sentiment = await sentimentService.getFearGreedIndex();

    // 2. 히스토리 저장
    await sentimentService.saveSentimentSnapshot();

    console.log(
      `📊 Sentiment updated: ${sentiment.value} (${sentiment.classification}) → ${sentiment.marketPhase}`
    );
  }
}
```

### 일일 스냅샷 Job 예시

```typescript
// jobs/daily-snapshot.job.ts

import { BaseJob } from "./base.job";
import { prisma } from "@/lib/prisma";

export class DailySnapshotJob extends BaseJob {
  readonly name = "DailySnapshot";
  readonly description = "일일 계정 스냅샷 생성";

  async execute(): Promise<void> {
    const config = await prisma.globalConfig.findFirst();
    if (!config) throw new Error("GlobalConfig not found");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 오늘의 거래 통계 집계
    const todayTrades = await prisma.trade.findMany({
      where: {
        exitTime: {
          gte: today,
        },
        status: "closed",
      },
    });

    const dailyPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const wins = todayTrades.filter((t) => (t.pnl || 0) > 0).length;
    const winRate = todayTrades.length > 0 ? wins / todayTrades.length : 0;

    const openPositions = await prisma.trade.count({
      where: { status: "open" },
    });

    // 드로다운 계산
    const drawdown =
      config.peakBalance > 0
        ? ((config.peakBalance - config.currentBalance) / config.peakBalance) *
          100
        : 0;

    // 스냅샷 저장
    await prisma.accountSnapshot.upsert({
      where: { date: today },
      update: {
        balance: config.currentBalance,
        equity: config.currentBalance, // 실제로는 미실현 PnL 포함
        dailyPnl,
        dailyPnlPercent: (dailyPnl / config.currentBalance) * 100,
        drawdown,
        winRate,
        totalTrades: todayTrades.length,
        openPositions,
      },
      create: {
        date: today,
        balance: config.currentBalance,
        equity: config.currentBalance,
        dailyPnl,
        dailyPnlPercent: (dailyPnl / config.currentBalance) * 100,
        drawdown,
        winRate,
        totalTrades: todayTrades.length,
        openPositions,
      },
    });

    console.log(
      `📸 Daily snapshot saved: $${config.currentBalance.toFixed(2)}`
    );
  }
}
```

---

## 🚀 서버 통합

```typescript
// index.ts

import { Elysia } from "elysia";
import { scheduler } from "./jobs/scheduler";

const app = new Elysia()
  .get("/health", () => ({ status: "ok" }))

  // 스케줄러 상태 조회 API
  .get("/scheduler/status", () => scheduler.getStatus())

  .listen(3000, () => {
    console.log("🦊 Server running on http://localhost:3000");

    // 서버 시작 시 스케줄러 시작
    scheduler.start();
  });

// Graceful shutdown
process.on("SIGINT", () => {
  scheduler.stop();
  process.exit(0);
});
```

---

## 📦 의존성

```bash
bun add croner
```

### `croner` 선택 이유

- ✅ 타입스크립트 네이티브
- ✅ 가벼움 (node-cron 대비)
- ✅ Bun 완벽 호환
- ✅ 초 단위 지원 (옵션)

---

## 🔄 캐시 전략 요약

### DB 캐시 (`ExternalDataCache` 테이블)

| 필드        | 설명                                    |
| ----------- | --------------------------------------- |
| `source`    | API 출처 (coingecko, defillama 등)      |
| `dataType`  | 데이터 종류 (price, tvl, fear_greed 등) |
| `key`       | 조회 키 (symbol, protocol name 등)      |
| `dataJson`  | 캐시된 데이터 (JSON)                    |
| `expiresAt` | 만료 시간                               |

### 작동 흐름

```
1. 데이터 요청
     ↓
2. DB 캐시 조회
     ↓
3. 유효한 캐시 있음? ─YES→ 캐시 반환
     │
     NO
     ↓
4. 외부 API 호출
     ↓
5. DB에 캐시 저장 (upsert)
     ↓
6. 데이터 반환
```

### 캐시 정리 (옵션)

```typescript
// 만료된 캐시 정리 (일일 1회)
await prisma.externalDataCache.deleteMany({
  where: {
    expiresAt: { lt: new Date() },
  },
});
```

---

## 📝 구현 순서

1. **`croner` 설치**: `bun add croner`
2. **Base 서비스 구현**: `services/external/base.service.ts`
3. **외부 API 서비스 구현**: CoinGecko, Sentiment 등
4. **스케줄러 구현**: `jobs/scheduler.ts`
5. **각 Job 구현**: 우선순위에 따라
6. **서버 통합**: `index.ts`에서 스케줄러 시작

---

_Last Updated: 2026-01-02_
