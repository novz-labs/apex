import { prisma } from "@db/prisma";
import type { AccountSnapshot } from "@generated/prisma/client";

export interface DailySnapshot {
  date: string;
  balance: number;
  equity: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  totalTrades: number;
  winRate: number;
  drawdown: number;
}

/**
 * 일일 스냅샷 실행
 */
export async function runDailySnapshot(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 현재 글로벌 설정 로드
  let config = await prisma.globalConfig.findUnique({
    where: { id: "default" },
  });
  if (!config) {
    config = await prisma.globalConfig.create({
      data: {
        id: "default",
        initialBalance: 1000,
        currentBalance: 1000,
        peakBalance: 1000,
      },
    });
  }

  // 오늘 날짜의 거래 기록에서 통계 계산
  const tradesToday = await prisma.trade.findMany({
    where: {
      exitTime: {
        gte: today,
      },
      status: "closed",
    },
  });

  const dailyPnl = tradesToday.reduce(
    (sum: number, t: any) => sum + (t.pnl || 0),
    0
  );
  const winCount = tradesToday.filter((t: any) => (t.pnl || 0) > 0).length;
  const winRate = tradesToday.length > 0 ? winCount / tradesToday.length : 0;

  const currentBalance = config.currentBalance + dailyPnl;
  const peakBalance = Math.max(config.peakBalance, currentBalance);
  const drawdown =
    peakBalance > 0 ? ((peakBalance - currentBalance) / peakBalance) * 100 : 0;

  // DB 업데이트
  await prisma.$transaction([
    prisma.globalConfig.update({
      where: { id: "default" },
      data: {
        currentBalance,
        peakBalance,
      },
    }),
    prisma.accountSnapshot.upsert({
      where: { date: today },
      update: {
        balance: currentBalance,
        equity: currentBalance, // 단순화
        dailyPnl,
        dailyPnlPercent:
          config.currentBalance > 0
            ? (dailyPnl / config.currentBalance) * 100
            : 0,
        winRate,
        totalTrades: tradesToday.length,
        drawdown,
      },
      create: {
        date: today,
        balance: currentBalance,
        equity: currentBalance,
        dailyPnl,
        dailyPnlPercent:
          config.currentBalance > 0
            ? (dailyPnl / config.currentBalance) * 100
            : 0,
        winRate,
        totalTrades: tradesToday.length,
        drawdown,
        openPositions: 0, // 추후 구현
      },
    }),
  ]);

  console.log(
    `📸 Daily snapshot saved: $${currentBalance.toFixed(2)} (${dailyPnl >= 0 ? "+" : ""}${dailyPnl.toFixed(2)}) DD: ${drawdown.toFixed(1)}%`
  );
}

/**
 * 스냅샷 히스토리 조회
 */
export async function getSnapshots(
  limit: number = 30
): Promise<DailySnapshot[]> {
  const data = await prisma.accountSnapshot.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });

  return data.map((s: AccountSnapshot) => ({
    date: s.date.toISOString().split("T")[0],
    balance: s.balance,
    equity: s.equity,
    dailyPnl: s.dailyPnl,
    dailyPnlPercent: s.dailyPnlPercent,
    totalTrades: s.totalTrades,
    winRate: s.winRate,
    drawdown: s.drawdown,
  }));
}

/**
 * 현재 계정 상태 조회
 */
export async function getAccountStatus() {
  let config = await prisma.globalConfig.findUnique({
    where: { id: "default" },
  });
  if (!config) {
    return {
      currentBalance: 1000,
      peakBalance: 1000,
      drawdown: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
    };
  }

  const initialBalance = config.initialBalance;
  const currentBalance = config.currentBalance;
  const peakBalance = config.peakBalance;
  const totalPnl = currentBalance - initialBalance;

  return {
    currentBalance,
    peakBalance,
    drawdown:
      peakBalance > 0
        ? ((peakBalance - currentBalance) / peakBalance) * 100
        : 0,
    totalPnl,
    totalPnlPercent: initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0,
  };
}

/**
 * 성과 요약 조회
 */
export async function getPerformanceSummary(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const snapshots = await prisma.accountSnapshot.findMany({
    where: { date: { gte: startDate } },
    orderBy: { date: "asc" },
  });

  if (snapshots.length === 0) {
    return {
      periodDays: days,
      totalPnl: 0,
      totalPnlPercent: 0,
      avgDailyPnl: 0,
      bestDay: null,
      worstDay: null,
      winningDays: 0,
      losingDays: 0,
    };
  }

  const totalPnl = snapshots.reduce((sum, s) => sum + s.dailyPnl, 0);
  const avgDailyPnl = totalPnl / snapshots.length;
  const bestDay = snapshots.reduce((best, s) =>
    s.dailyPnl > (best?.dailyPnl || -Infinity) ? s : best
  );
  const worstDay = snapshots.reduce((worst, s) =>
    s.dailyPnl < (worst?.dailyPnl || Infinity) ? s : worst
  );
  const winningDays = snapshots.filter((s) => s.dailyPnl > 0).length;
  const losingDays = snapshots.filter((s) => s.dailyPnl < 0).length;

  return {
    periodDays: days,
    totalPnl,
    totalPnlPercent:
      snapshots[0].balance > 0 ? (totalPnl / snapshots[0].balance) * 100 : 0,
    avgDailyPnl,
    bestDay: bestDay
      ? { date: bestDay.date.toISOString().split("T")[0], pnl: bestDay.dailyPnl }
      : null,
    worstDay: worstDay
      ? { date: worstDay.date.toISOString().split("T")[0], pnl: worstDay.dailyPnl }
      : null,
    winningDays,
    losingDays,
  };
}

/**
 * 잔고 설정 (테스트/초기화용)
 */
export async function setBalance(balance: number): Promise<void> {
  await prisma.globalConfig.upsert({
    where: { id: "default" },
    update: {
      currentBalance: balance,
      peakBalance: balance,
    },
    create: {
      id: "default",
      initialBalance: balance,
      currentBalance: balance,
      peakBalance: balance,
    },
  });
  console.log(`💰 Balance set to $${balance.toFixed(2)}`);
}
