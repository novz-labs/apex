// src/modules/market/indicator.service.ts

import {
  ADX,
  ATR,
  BollingerBands,
  EMA,
  MACD,
  RSI,
  Stochastic,
} from "trading-signals";
import { prisma } from "../db/prisma";
import type { IndicatorSnapshot } from "../strategy/momentum.service";
import type { ScalpingIndicators } from "../strategy/scalping.service";

/**
 * 기술 지표 계산 서비스
 */
export class IndicatorService {
  /**
   * Momentum 전략용 지표 스냅샷 조회
   */
  async getSnapshot(
    symbol: string,
    timeframe: string = "1m",
    currentPrice: number
  ): Promise<IndicatorSnapshot | null> {
    try {
      // 충분한 데이터를 위해 최신 캔들 100개 조회
      const candles = await prisma.candleCache.findMany({
        where: { symbol, timeframe },
        orderBy: { openTime: "desc" },
        take: 100,
      });

      if (candles.length < 20) return null; // BB(20) 등을 위해 최소 데이터 필요

      // 시간 순서대로 정렬 ( trading-signals는 순차 입력 기대)
      const sortedCandles = [...candles].reverse();

      // 지표 초기화
      const rsi = new RSI(14);
      const bb = new BollingerBands(20, 2);
      const adx = new ADX(14);
      const ema20 = new EMA(20);
      const ema50 = new EMA(50);
      const ema100 = new EMA(100);
      const macd = new MACD(12, 26, 9);

      // 데이터 입력
      for (const candle of sortedCandles) {
        const price = candle.close;
        rsi.update(price);
        bb.update(price);
        ema20.update(price);
        ema50.update(price);
        ema100.update(price);
        macd.update(price);

        // ADX는 High/Low/Close 필요
        adx.update({
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
      }

      const bbResult = bb.getResult();
      const macdResult = macd.getResult();
      const adxResult = adx.getResult();

      let bbPosition: "above_upper" | "below_lower" | "within" = "within";
      if (currentPrice > bbResult.upper) bbPosition = "above_upper";
      else if (currentPrice < bbResult.lower) bbPosition = "below_lower";

      let macdCrossover: "bullish" | "bearish" | "none" = "none";
      if (macdResult.histogram > 0) macdCrossover = "bullish";
      else if (macdResult.histogram < 0) macdCrossover = "bearish";

      return {
        rsi: rsi.getResult().toNumber(),
        bbPosition,
        bbUpper: bbResult.upper.toNumber(),
        bbMiddle: bbResult.middle.toNumber(),
        bbLower: bbResult.lower.toNumber(),
        adx: adxResult.adx.toNumber(),
        plusDI: adxResult.pdi.toNumber(),
        minusDI: adxResult.mdi.toNumber(),
        ema20: ema20.getResult().toNumber(),
        ema50: ema50.getResult().toNumber(),
        ema100: ema100.getResult().toNumber(),
        macdCrossover,
        macdLine: macdResult.macd.toNumber(),
        signalLine: macdResult.signal.toNumber(),
        macdHistogram: macdResult.histogram.toNumber(),
      };
    } catch (error) {
      console.error(
        `[IndicatorService] Failed to get snapshot for ${symbol}:`,
        error
      );
      return null;
    }
  }

  /**
   * Scalping 전략용 지표 조회
   */
  async getScalpingIndicators(
    symbol: string,
    timeframe: string = "1m",
    currentPrice: number,
    bidPrice: number,
    askPrice: number
  ): Promise<ScalpingIndicators | null> {
    try {
      const candles = await prisma.candleCache.findMany({
        where: { symbol, timeframe },
        orderBy: { openTime: "desc" },
        take: 50,
      });

      if (candles.length < 14) return null;

      const sortedCandles = [...candles].reverse();

      const rsi = new RSI(14);
      const stoch = new Stochastic(14, 3, 3);
      const atr = new ATR(14);

      for (const candle of sortedCandles) {
        rsi.update(candle.close);
        stoch.update({
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
        atr.update({
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
      }

      const stochResult = stoch.getResult();

      // 24시간 거래량 합계 (단순히 현재 캐시된 데이터 기반)
      const volume24h = candles.reduce((sum, c) => sum + c.volume, 0);

      return {
        rsi: rsi.getResult().toNumber(),
        stochK: stochResult.k.toNumber(),
        stochD: stochResult.d.toNumber(),
        atr: atr.getResult().toNumber(),
        volume24h,
        bidPrice,
        askPrice,
      };
    } catch (error) {
      console.error(
        `[IndicatorService] Failed to get scalping indicators for ${symbol}:`,
        error
      );
      return null;
    }
  }
}

export const indicatorService = new IndicatorService();
