import { prisma } from "../db/prisma";

export interface CreateTradeParams {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  size: number;
  leverage: number;
  strategyId: string;
  indicatorsJson?: string;
}

export interface CloseTradeParams {
  tradeId: string;
  exitPrice: number;
  exitReason: "tp" | "sl" | "trailing_stop" | "manual" | "liquidation";
}

/**
 * 활성화된 포지션 생성
 */
export async function createTrade(params: CreateTradeParams) {
  return await prisma.trade.create({
    data: {
      symbol: params.symbol,
      side: params.side,
      entryPrice: params.entryPrice,
      size: params.size,
      leverage: params.leverage,
      strategyId: params.strategyId,
      indicatorsJson: params.indicatorsJson ?? "{}",
      status: "open",
    },
  });
}

/**
 * 열린 포지션 종료
 */
export async function closeTrade(params: CloseTradeParams) {
  const trade = await prisma.trade.findUnique({
    where: { id: params.tradeId },
  });

  if (!trade) {
    throw new Error(`Trade not found: ${params.tradeId}`);
  }

  const pnl =
    trade.side === "long"
      ? (params.exitPrice - trade.entryPrice) * trade.size
      : (trade.entryPrice - params.exitPrice) * trade.size;

  const pnlPercent =
    (pnl / (trade.entryPrice * trade.size)) * 100 * trade.leverage;

  return await prisma.trade.update({
    where: { id: params.tradeId },
    data: {
      exitPrice: params.exitPrice,
      exitReason: params.exitReason,
      status: "closed",
      pnl,
      pnlPercent,
      exitTime: new Date(),
    },
  });
}

/**
 * 특정 전략의 최근 거래 내역 조회
 */
export async function getRecentTrades(strategyId: string, limit: number = 20) {
  return await prisma.trade.findMany({
    where: { strategyId },
    orderBy: { entryTime: "desc" },
    take: limit,
  });
}

/**
 * 모든 거래 요약 통계
 */
export async function getTradeStats(strategyId: string) {
  const trades = await prisma.trade.findMany({
    where: { strategyId, status: "closed" },
  });

  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalPnl: 0,
      profitFactor: 0,
    };
  }

  const wins = trades.filter((t: any) => (t.pnl || 0) > 0);
  const losses = trades.filter((t: any) => (t.pnl || 0) <= 0);

  const totalWin = wins.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
  const totalLoss = Math.abs(
    losses.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0)
  );

  return {
    totalTrades: trades.length,
    winRate: wins.length / trades.length,
    totalPnl: totalWin - totalLoss,
    profitFactor:
      totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0,
  };
}
