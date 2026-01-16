// src/jobs/candle-collector.job.ts

/**
 * 캔들 데이터 수집 Job
 * - Hyperliquid에서 1분봉 캔들 데이터 수집
 * - DB에 저장하여 지표 계산에 활용
 */

import { getInfoClient } from "../modules/exchange/hyperliquid.client";

// 수집할 심볼 목록
const SYMBOLS = ["BTC", "ETH", "SOL"];
const CANDLE_INTERVAL = "1m";

interface CandleData {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 인메모리 캔들 저장소 (추후 DB로 교체)
const candleStore: Map<string, CandleData[]> = new Map();
const MAX_CANDLES_PER_SYMBOL = 1000; // 약 16시간 분량

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
        console.log(`📊 [${symbol}] No candles returned`);
        continue;
      }

      // 가장 최근 캔들
      const latest = candles[candles.length - 1];
      const candleData: CandleData = {
        symbol,
        timestamp: latest.t,
        open: parseFloat(latest.o),
        high: parseFloat(latest.h),
        low: parseFloat(latest.l),
        close: parseFloat(latest.c),
        volume: parseFloat(latest.v),
      };

      // 저장소에 추가
      if (!candleStore.has(symbol)) {
        candleStore.set(symbol, []);
      }

      const symbolCandles = candleStore.get(symbol)!;

      // 중복 체크
      const lastCandle = symbolCandles[symbolCandles.length - 1];
      if (!lastCandle || lastCandle.timestamp !== candleData.timestamp) {
        symbolCandles.push(candleData);

        // 최대 개수 제한
        if (symbolCandles.length > MAX_CANDLES_PER_SYMBOL) {
          symbolCandles.shift();
        }

        console.log(
          `📈 [${symbol}] Candle: O=${candleData.open} H=${candleData.high} L=${candleData.low} C=${candleData.close} V=${candleData.volume.toFixed(2)}`
        );
      }
    } catch (error) {
      console.error(`❌ [${symbol}] Candle collection failed:`, error);
    }
  }
}

/**
 * 특정 심볼의 캔들 데이터 조회
 */
export function getCandles(symbol: string, limit?: number): CandleData[] {
  const candles = candleStore.get(symbol) || [];
  if (limit) {
    return candles.slice(-limit);
  }
  return [...candles];
}

/**
 * 모든 심볼의 최신 캔들 조회
 */
export function getLatestCandles(): Record<string, CandleData | null> {
  const result: Record<string, CandleData | null> = {};

  for (const symbol of SYMBOLS) {
    const candles = candleStore.get(symbol);
    result[symbol] =
      candles && candles.length > 0 ? candles[candles.length - 1] : null;
  }

  return result;
}

/**
 * 캔들 통계
 */
export function getCandleStats(): {
  symbols: string[];
  counts: Record<string, number>;
  totalCandles: number;
} {
  const counts: Record<string, number> = {};
  let total = 0;

  for (const symbol of SYMBOLS) {
    const count = candleStore.get(symbol)?.length || 0;
    counts[symbol] = count;
    total += count;
  }

  return {
    symbols: SYMBOLS,
    counts,
    totalCandles: total,
  };
}
