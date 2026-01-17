// src/modules/backtest/data-loader.ts

import { prisma } from "../db/prisma";
import type { CandleData } from "./backtest.service";

// ============================================
// Historical Data Loader
// ============================================

/**
 * DB에서 캔들 데이터 로드
 */
export async function loadCandlesFromDB(params: {
  symbol: string;
  timeframe?: string;
  startDate: Date;
  endDate: Date;
}): Promise<CandleData[]> {
  const { symbol, timeframe = "1m", startDate, endDate } = params;

  const candles = await prisma.candleCache.findMany({
    where: {
      symbol,
      timeframe,
      openTime: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { openTime: "asc" },
  });

  return candles.map((c) => ({
    timestamp: c.openTime.getTime(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

/**
 * CSV 파일에서 캔들 데이터 로드
 *
 * 예상 CSV 포맷:
 * timestamp,open,high,low,close,volume
 * 1704067200000,42000,42500,41800,42300,1500
 */
export async function loadCandlesFromCSV(
  filePath: string
): Promise<CandleData[]> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const text = await file.text();
  const lines = text.trim().split("\n");

  // Header 스킵
  const dataLines = lines.slice(1);

  return dataLines.map((line, index) => {
    const parts = line.split(",");

    if (parts.length < 6) {
      throw new Error(`Invalid CSV format at line ${index + 2}: ${line}`);
    }

    return {
      timestamp: parseInt(parts[0], 10),
      open: parseFloat(parts[1]),
      high: parseFloat(parts[2]),
      low: parseFloat(parts[3]),
      close: parseFloat(parts[4]),
      volume: parseFloat(parts[5]),
    };
  });
}

/**
 * Binance API에서 히스토리컬 캔들 다운로드
 */
export async function fetchHistoricalCandles(params: {
  symbol: string;
  interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  startTime: number;
  endTime: number;
  limit?: number;
}): Promise<CandleData[]> {
  const { symbol, interval, startTime, endTime, limit = 1000 } = params;

  const isTestnet = process.env.BINANCE_TESTNET === "true";
  const baseUrl = isTestnet
    ? "https://testnet.binancefuture.com"
    : "https://fapi.binance.com";

  const url = new URL(`${baseUrl}/fapi/v1/klines`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("startTime", startTime.toString());
  url.searchParams.set("endTime", endTime.toString());
  url.searchParams.set("limit", limit.toString());

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch candles: ${error}`);
  }

  const data = (await response.json()) as Array<
    [
      number,
      string,
      string,
      string,
      string,
      string,
      number,
      string,
      number,
      string,
      string,
      string,
    ]
  >;

  return data.map((kline) => ({
    timestamp: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
  }));
}

/**
 * 히스토리컬 데이터 다운로드 및 DB 저장
 */
export async function downloadAndSaveCandles(params: {
  symbol: string;
  interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  days: number;
}): Promise<{ saved: number; symbol: string }> {
  const { symbol, interval, days } = params;

  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  console.log(
    `📥 Downloading ${days} days of ${symbol} ${interval} candles...`
  );

  const candles = await fetchHistoricalCandles({
    symbol: `${symbol}USDT`,
    interval,
    startTime,
    endTime,
  });

  console.log(`   Fetched ${candles.length} candles`);

  // DB에 저장 (upsert)
  let saved = 0;
  for (const candle of candles) {
    try {
      await prisma.candleCache.upsert({
        where: {
          symbol_timeframe_openTime: {
            symbol,
            timeframe: interval,
            openTime: new Date(candle.timestamp),
          },
        },
        update: {
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        },
        create: {
          symbol,
          timeframe: interval,
          openTime: new Date(candle.timestamp),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        },
      });
      saved++;
    } catch (error) {
      // 중복 등 무시
    }
  }

  console.log(`✅ Saved ${saved} candles for ${symbol}`);

  return { saved, symbol };
}

/**
 * 데이터 가용성 체크
 */
export async function checkDataAvailability(params: {
  symbol: string;
  timeframe: string;
  startDate: Date;
  endDate: Date;
}): Promise<{
  available: boolean;
  count: number;
  expectedCount: number;
  coverage: number;
}> {
  const { symbol, timeframe, startDate, endDate } = params;

  const count = await prisma.candleCache.count({
    where: {
      symbol,
      timeframe,
      openTime: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // 예상 캔들 수 계산 (timeframe 기준)
  const durationMs = endDate.getTime() - startDate.getTime();
  const intervalMs = getIntervalMs(timeframe);
  const expectedCount = Math.floor(durationMs / intervalMs);

  const coverage = expectedCount > 0 ? (count / expectedCount) * 100 : 0;

  return {
    available: coverage >= 80, // 80% 이상이면 사용 가능
    count,
    expectedCount,
    coverage,
  };
}

function getIntervalMs(timeframe: string): number {
  const map: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };
  return map[timeframe] || 60 * 1000;
}
