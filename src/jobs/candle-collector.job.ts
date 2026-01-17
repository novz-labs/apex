import { prisma } from "@db/prisma";
import type { CandleCache } from "@generated/prisma/client";
import { getInfoClient } from "../modules/hyperliquid";

// 수집할 심볼 목록
const SYMBOLS = ["BTC", "ETH", "SOL"];
const CANDLE_INTERVAL = "1m";

export interface CandleData {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 캔들 데이터 수집 실행
 */
export async function runCandleCollector(): Promise<void> {
  const client = getInfoClient();

  for (const symbol of SYMBOLS) {
    try {
      // Hyperliquid에서 최근 캔들 조회
      const candles = await client.candleSnapshot({
        coin: symbol,
        interval: CANDLE_INTERVAL,
        startTime: Date.now() - 60 * 60 * 1000, // 1시간 전부터
        endTime: Date.now(),
      });

      if (!candles || candles.length === 0) {
        // console.log(`📊 [${symbol}] No candles returned`);
        continue;
      }

      // 캔들 데이터를 DB에 저장
      const upsertPromises = candles.map((c) => {
        const openTime = new Date(c.t);
        return prisma.candleCache.upsert({
          where: {
            symbol_timeframe_openTime: {
              symbol,
              timeframe: CANDLE_INTERVAL,
              openTime,
            },
          },
          update: {
            open: parseFloat(c.o),
            high: parseFloat(c.h),
            low: parseFloat(c.l),
            close: parseFloat(c.c),
            volume: parseFloat(c.v),
          },
          create: {
            symbol,
            timeframe: CANDLE_INTERVAL,
            openTime,
            open: parseFloat(c.o),
            high: parseFloat(c.h),
            low: parseFloat(c.l),
            close: parseFloat(c.c),
            volume: parseFloat(c.v),
          },
        });
      });

      await Promise.all(upsertPromises);

      const latest = candles[candles.length - 1];
      console.log(
        `📈 [${symbol}] Candle stored: ${new Date(latest.t).toLocaleTimeString()} C=${latest.c}`
      );
    } catch (error) {
      console.error(`❌ [${symbol}] Candle collection failed:`, error);
    }
  }
}

/**
 * 특정 심볼의 캔들 데이터 조회
 */
export async function getCandles(
  symbol: string,
  limit: number = 100
): Promise<CandleData[]> {
  const data = await prisma.candleCache.findMany({
    where: { symbol, timeframe: CANDLE_INTERVAL },
    orderBy: { openTime: "desc" },
    take: limit,
  });

  return data.reverse().map((c: CandleCache) => ({
    symbol: c.symbol,
    timestamp: c.openTime.getTime(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

/**
 * 모든 심볼의 최신 캔들 조회
 */
export async function getLatestCandles(): Promise<
  Record<string, CandleData | null>
> {
  const result: Record<string, CandleData | null> = {};

  for (const symbol of SYMBOLS) {
    const latest = await prisma.candleCache.findFirst({
      where: { symbol, timeframe: CANDLE_INTERVAL },
      orderBy: { openTime: "desc" },
    });

    result[symbol] = latest
      ? {
          symbol: latest.symbol,
          timestamp: latest.openTime.getTime(),
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
          volume: latest.volume,
        }
      : null;
  }

  return result;
}

/**
 * 캔들 수집 통계 조회
 */
export async function getCandleStats(): Promise<{
  symbols: string[];
  totalCandles: number;
  oldestCandle: Date | null;
  newestCandle: Date | null;
}> {
  const count = await prisma.candleCache.count();
  const oldest = await prisma.candleCache.findFirst({
    orderBy: { openTime: "asc" },
    select: { openTime: true },
  });
  const newest = await prisma.candleCache.findFirst({
    orderBy: { openTime: "desc" },
    select: { openTime: true },
  });

  return {
    symbols: SYMBOLS,
    totalCandles: count,
    oldestCandle: oldest?.openTime || null,
    newestCandle: newest?.openTime || null,
  };
}
