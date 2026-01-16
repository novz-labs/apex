// src/jobs/daily-snapshot.job.ts

/**
 * 일일 스냅샷 Job
 * - 계정 잔고 기록
 * - 일일 PnL 계산
 * - 성과 통계 저장
 */

interface DailySnapshot {
  date: string;
  balance: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  drawdown: number;
}

// 인메모리 스냅샷 저장소
const snapshots: DailySnapshot[] = [];
let peakBalance = 1000; // 초기 자본
let currentBalance = 1000;

/**
 * 일일 스냅샷 실행
 */
export async function runDailySnapshot(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateStr = today.toISOString().split("T")[0];

  // 이미 오늘 스냅샷이 있으면 업데이트
  const existingIndex = snapshots.findIndex((s) => s.date === dateStr);

  // 임시: 랜덤 일일 PnL 시뮬레이션 (실제로는 거래 기록에서 계산)
  const dailyPnl = (Math.random() - 0.4) * 50; // -$20 ~ $30
  currentBalance += dailyPnl;

  // 피크 업데이트
  if (currentBalance > peakBalance) {
    peakBalance = currentBalance;
  }

  // 드로다운 계산
  const drawdown =
    peakBalance > 0 ? ((peakBalance - currentBalance) / peakBalance) * 100 : 0;

  const snapshot: DailySnapshot = {
    date: dateStr,
    balance: currentBalance,
    dailyPnl,
    dailyPnlPercent: (dailyPnl / (currentBalance - dailyPnl)) * 100,
    totalTrades: Math.floor(Math.random() * 10) + 1, // 임시
    winCount: Math.floor(Math.random() * 7),
    lossCount: Math.floor(Math.random() * 5),
    winRate: 0,
    drawdown,
  };

  snapshot.winRate =
    snapshot.totalTrades > 0 ? snapshot.winCount / snapshot.totalTrades : 0;

  if (existingIndex >= 0) {
    snapshots[existingIndex] = snapshot;
  } else {
    snapshots.push(snapshot);
  }

  console.log(
    `📸 Daily snapshot: $${currentBalance.toFixed(2)} (${dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}) DD: ${drawdown.toFixed(1)}%`
  );
}

/**
 * 스냅샷 히스토리 조회
 */
export function getSnapshots(limit?: number): DailySnapshot[] {
  if (limit) {
    return snapshots.slice(-limit);
  }
  return [...snapshots];
}

/**
 * 현재 계정 상태 조회
 */
export function getAccountStatus(): {
  currentBalance: number;
  peakBalance: number;
  drawdown: number;
  totalPnl: number;
  totalPnlPercent: number;
} {
  const initialBalance = 1000;
  const totalPnl = currentBalance - initialBalance;

  return {
    currentBalance,
    peakBalance,
    drawdown:
      peakBalance > 0
        ? ((peakBalance - currentBalance) / peakBalance) * 100
        : 0,
    totalPnl,
    totalPnlPercent: (totalPnl / initialBalance) * 100,
  };
}

/**
 * 성과 요약 조회
 */
export function getPerformanceSummary(days = 30): {
  totalDays: number;
  totalPnl: number;
  averageDailyPnl: number;
  bestDay: DailySnapshot | null;
  worstDay: DailySnapshot | null;
  winningDays: number;
  losingDays: number;
} {
  const recentSnapshots = snapshots.slice(-days);

  if (recentSnapshots.length === 0) {
    return {
      totalDays: 0,
      totalPnl: 0,
      averageDailyPnl: 0,
      bestDay: null,
      worstDay: null,
      winningDays: 0,
      losingDays: 0,
    };
  }

  const totalPnl = recentSnapshots.reduce((sum, s) => sum + s.dailyPnl, 0);
  const winningDays = recentSnapshots.filter((s) => s.dailyPnl > 0).length;
  const losingDays = recentSnapshots.filter((s) => s.dailyPnl < 0).length;

  const sortedByPnl = [...recentSnapshots].sort(
    (a, b) => b.dailyPnl - a.dailyPnl
  );

  return {
    totalDays: recentSnapshots.length,
    totalPnl,
    averageDailyPnl: totalPnl / recentSnapshots.length,
    bestDay: sortedByPnl[0] || null,
    worstDay: sortedByPnl[sortedByPnl.length - 1] || null,
    winningDays,
    losingDays,
  };
}

/**
 * 잔고 수동 설정 (테스트용)
 */
export function setBalance(balance: number): void {
  currentBalance = balance;
  if (balance > peakBalance) {
    peakBalance = balance;
  }
}
