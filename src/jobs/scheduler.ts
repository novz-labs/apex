// src/jobs/scheduler.ts
import { Cron } from "croner";

// ============================================
// 타입 정의
// ============================================

interface ScheduledJob {
  name: string;
  cron: Cron;
  lastRun?: Date;
  lastError?: string;
  runCount: number;
}

type JobHandler = () => Promise<void>;

// ============================================
// 스케줄러 클래스
// ============================================

class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private isRunning = false;

  /**
   * 스케줄러 시작
   */
  start(): void {
    if (this.isRunning) {
      console.warn("⚠️ Scheduler already running");
      return;
    }

    console.log("🚀 Starting scheduler...");
    this.isRunning = true;
    console.log(`✅ Scheduler started`);
  }

  /**
   * 스케줄러 중지
   */
  stop(): void {
    for (const [name, job] of this.jobs) {
      job.cron.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    }
    this.jobs.clear();
    this.isRunning = false;
    console.log("🛑 Scheduler stopped");
  }

  /**
   * Job 등록
   */
  register(name: string, pattern: string, handler: JobHandler): void {
    if (this.jobs.has(name)) {
      console.warn(`⚠️ Job ${name} already registered, skipping`);
      return;
    }

    const cron = new Cron(pattern, async () => {
      await this.runJob(name, handler);
    });

    this.jobs.set(name, {
      name,
      cron,
      runCount: 0,
    });

    console.log(`📅 Registered job: ${name} (${pattern})`);
  }

  /**
   * Job 수동 실행
   */
  async runManual(name: string): Promise<{ success: boolean; error?: string }> {
    const job = this.jobs.get(name);
    if (!job) {
      return { success: false, error: `Job ${name} not found` };
    }

    console.log(`🔄 Manual run: ${name}`);

    try {
      // Job의 핸들러를 가져와서 실행해야 하지만,
      // Cron 인스턴스에서 핸들러에 접근할 수 없으므로
      // trigger() 메서드 사용
      job.cron.trigger();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Job 실행 (내부)
   */
  private async runJob(name: string, handler: JobHandler): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) return;

    console.log(`⏰ [${name}] Running...`);
    const startTime = Date.now();

    try {
      await handler();
      job.lastRun = new Date();
      job.lastError = undefined;
      job.runCount++;
      console.log(`✅ [${name}] Completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      job.lastError = String(error);
      console.error(`❌ [${name}] Failed:`, error);
    }
  }

  /**
   * 스케줄러 상태 조회
   */
  getStatus(): {
    isRunning: boolean;
    jobCount: number;
    jobs: Array<{
      name: string;
      nextRun: Date | null;
      lastRun?: Date;
      lastError?: string;
      runCount: number;
    }>;
  } {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs: Array.from(this.jobs.values()).map((job) => ({
        name: job.name,
        nextRun: job.cron.nextRun(),
        lastRun: job.lastRun,
        lastError: job.lastError,
        runCount: job.runCount,
      })),
    };
  }

  /**
   * 등록된 Job 목록
   */
  getJobNames(): string[] {
    return Array.from(this.jobs.keys());
  }
}

export const scheduler = new Scheduler();
