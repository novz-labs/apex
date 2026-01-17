// src/modules/market/indicator.service.ts

import {
  ADX,
  ATR,
  BollingerBands,
  EMA,
  MACD,
  RSI,
  StochasticOscillator as Stochastic,
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
      const candles = await prisma.candleCache.findMany({
        where: { symbol, timeframe },
        orderBy: { openTime: "desc" },
        take: 100,
      });

      if (candles.length < 20) return null;

      const sortedCandles = [...candles].reverse();
      return this.calculateSnapshot(sortedCandles, currentPrice);
    } catch (error) {
      console.error(
        `[IndicatorService] Failed to get snapshot for ${symbol}:`,
        error
      );
      return null;
    }
  }

  /**
   * 캔들 데이터 기반 지표 계산 (백테스트 등에서 사용)
   */
  calculateSnapshot(
    candles: any[],
    currentPrice: number
  ): IndicatorSnapshot | null {
    if (candles.length < 20) return null;

    const rsi = new RSI(14);
    const bb = new BollingerBands(20, 2);
    const adx = new ADX(14);
    const ema20 = new EMA(20);
    const ema50 = new EMA(50);
    const ema100 = new EMA(100);
    const macd = new MACD(new EMA(12), new EMA(26), new EMA(9));

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const p = candle.close;
      const replace = false;

      rsi.update(p, replace);
      bb.update(p, replace);
      ema20.update(p, replace);
      ema50.update(p, replace);
      ema100.update(p, replace);
      macd.update(p, replace);

      adx.update(
        {
          high: candle.high,
          low: candle.low,
          close: candle.close,
        },
        replace
      );
    }

    const bbResult = bb.getResult();
    const macdResult = macd.getResult();
    const adxVal = adx.getResult();

    if (!bbResult || !macdResult || adxVal === null) return null;

    let bbPosition: "above_upper" | "below_lower" | "within" = "within";
    if (currentPrice > Number(bbResult.upper)) bbPosition = "above_upper";
    else if (currentPrice < Number(bbResult.lower)) bbPosition = "below_lower";

    let macdCrossover: "bullish" | "bearish" | "none" = "none";
    if (Number(macdResult.histogram) > 0) macdCrossover = "bullish";
    else if (Number(macdResult.histogram) < 0) macdCrossover = "bearish";

    return {
      rsi: Number(rsi.getResult() ?? 0),
      bbPosition,
      bbUpper: Number(bbResult.upper),
      bbMiddle: Number(bbResult.middle),
      bbLower: Number(bbResult.lower),
      adx: Number(adxVal),
      plusDI: Number(adx.pdi ?? 0),
      minusDI: Number(adx.mdi ?? 0),
      ema20: Number(ema20.getResult()),
      ema50: Number(ema50.getResult()),
      ema100: Number(ema100.getResult()),
      macdCrossover,
      macdLine: Number(macdResult.macd),
      signalLine: Number(macdResult.signal),
      macdHistogram: Number(macdResult.histogram),
    };
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
      return this.calculateScalpingIndicators(
        sortedCandles,
        bidPrice,
        askPrice
      );
    } catch (error) {
      console.error(
        `[IndicatorService] Failed to get scalping indicators for ${symbol}:`,
        error
      );
      return null;
    }
  }

  /**
   * 캔들 데이터 기반 스캘핑 지표 계산
   */
  calculateScalpingIndicators(
    candles: any[],
    bidPrice: number,
    askPrice: number
  ): ScalpingIndicators | null {
    if (candles.length < 14) return null;

    const rsi = new RSI(14);
    const stoch = new Stochastic(14, 3, 3);
    const atr = new ATR(14);

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const replace = false;
      rsi.update(candle.close, replace);
      stoch.update(
        {
          high: candle.high,
          low: candle.low,
          close: candle.close,
        },
        replace
      );
      atr.update(
        {
          high: candle.high,
          low: candle.low,
          close: candle.close,
        },
        replace
      );
    }

    const stochResult = stoch.getResult();
    const atrResult = atr.getResult();

    if (!stochResult || !atrResult) return null;

    const volume24h = candles.reduce((sum, c) => sum + c.volume, 0);

    return {
      rsi: Number(rsi.getResult() ?? 0),
      stochK: Number(stochResult.stochK),
      stochD: Number(stochResult.stochD),
      atr: Number(atrResult),
      volume24h,
      bidPrice,
      askPrice,
    };
  }
}

export const indicatorService = new IndicatorService();
