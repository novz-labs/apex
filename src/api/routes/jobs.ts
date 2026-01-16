// src/api/routes/jobs.ts
import { Elysia, t } from "elysia";
import {
  getAccountStatus,
  getCandleStats,
  getCurrentSentiment,
  getLatestCandles,
  getPerformanceSummary,
  getSentimentTrend,
  getSnapshots,
  runCandleCollector,
  runDailySnapshot,
  runSentimentUpdater,
  scheduler,
} from "../../jobs";

// ============================================
// Jobs 초기화 함수
// ============================================

export function initializeJobs(): void {
  // 매 1분: 캔들 수집
  scheduler.register("candle-collector", "* * * * *", runCandleCollector);

  // 매 시간: 센티먼트 업데이트
  scheduler.register("sentiment-updater", "0 * * * *", runSentimentUpdater);

  // 매일 00:00 UTC: 일일 스냅샷
  scheduler.register("daily-snapshot", "0 0 * * *", runDailySnapshot);

  // 스케줄러 시작
  scheduler.start();
}

// ============================================
// API 라우트
// ============================================

export const jobsRoutes = new Elysia({ prefix: "/jobs" })
  // ============================================
  // 스케줄러 상태
  // ============================================
  .get(
    "/status",
    () => {
      return scheduler.getStatus();
    },
    {
      detail: {
        tags: ["Jobs"],
        summary: "스케줄러 상태 조회",
        description: "등록된 모든 Job의 상태 및 다음 실행 시간",
      },
    }
  )

  // ============================================
  // 수동 실행
  // ============================================
  .post(
    "/run/:jobName",
    async ({ params, set }) => {
      const validJobs = [
        "candle-collector",
        "sentiment-updater",
        "daily-snapshot",
      ];

      if (!validJobs.includes(params.jobName)) {
        set.status = 400;
        return { error: `Invalid job name. Valid: ${validJobs.join(", ")}` };
      }

      console.log(`🔄 Manual trigger: ${params.jobName}`);

      try {
        switch (params.jobName) {
          case "candle-collector":
            await runCandleCollector();
            break;
          case "sentiment-updater":
            await runSentimentUpdater();
            break;
          case "daily-snapshot":
            await runDailySnapshot();
            break;
        }

        return { success: true, job: params.jobName, message: "Job executed" };
      } catch (error) {
        set.status = 500;
        return { success: false, error: String(error) };
      }
    },
    {
      params: t.Object({ jobName: t.String() }),
      detail: {
        tags: ["Jobs"],
        summary: "Job 수동 실행",
        description: "특정 Job을 즉시 실행",
      },
    }
  )

  // ============================================
  // 캔들 데이터
  // ============================================
  .get(
    "/candles",
    () => {
      return {
        latest: getLatestCandles(),
        stats: getCandleStats(),
      };
    },
    {
      detail: {
        tags: ["Jobs"],
        summary: "캔들 데이터 조회",
        description: "수집된 최신 캔들 데이터",
      },
    }
  )

  // ============================================
  // 센티먼트 데이터
  // ============================================
  .get(
    "/sentiment",
    () => {
      return {
        current: getCurrentSentiment(),
        trend: getSentimentTrend(),
      };
    },
    {
      detail: {
        tags: ["Jobs"],
        summary: "센티먼트 데이터 조회",
        description: "Fear & Greed Index 및 마켓 페이즈",
      },
    }
  )

  // ============================================
  // 계정 상태
  // ============================================
  .get(
    "/account",
    () => {
      return {
        status: getAccountStatus(),
        snapshots: getSnapshots(7), // 최근 7일
        performance: getPerformanceSummary(30),
      };
    },
    {
      detail: {
        tags: ["Jobs"],
        summary: "계정 상태 조회",
        description: "잔고, 일일 스냅샷, 성과 요약",
      },
    }
  );
