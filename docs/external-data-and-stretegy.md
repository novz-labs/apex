# 📊 외부 데이터 서비스 & 트레이딩 전략 가이드

## 🔌 외부 API 서비스 정리

### 1. 시장 데이터 (Market Data)

| 서비스            | 용도                      | 무료 Tier      | API                         |
| ----------------- | ------------------------- | -------------- | --------------------------- |
| **CoinGecko**     | 가격, MC, FDV, 볼륨       | 30 calls/min   | `api.coingecko.com`         |
| **CoinMarketCap** | 가격, 랭킹, 글로벌 메트릭 | 10K credits/월 | `pro-api.coinmarketcap.com` |
| **CoinPaprika**   | 가격 + 소셜 시그널        | 무제한 (기본)  | `api.coinpaprika.com`       |
| **CryptoCompare** | 가격, 뉴스, 소셜          | 100K calls/월  | `min-api.cryptocompare.com` |

### 2. 온체인 & DeFi 데이터

| 서비스             | 용도                  | 무료 Tier    | API            |
| ------------------ | --------------------- | ------------ | -------------- |
| **DeFiLlama**      | TVL, 프로토콜, Yields | ✅ 완전 무료 | `api.llama.fi` |
| **Dune Analytics** | 커스텀 온체인 쿼리    | 제한적       | `api.dune.com` |
| **Nansen**         | 스마트머니 추적       | 유료         | -              |
| **Arkham**         | 지갑 라벨링           | 유료         | -              |

### 3. 센티먼트 & 소셜

| 서비스             | 용도                        | 무료 Tier    | API                      |
| ------------------ | --------------------------- | ------------ | ------------------------ |
| **Alternative.me** | Fear & Greed Index          | ✅ 완전 무료 | `api.alternative.me/fng` |
| **CoinyBubble**    | Fear & Greed (Binance 방식) | ✅ 완전 무료 | `coinybubble.com/api`    |
| **CFGI.io**        | 멀티 타임프레임 F&G         | 기본 무료    | `cfgi.io/api`            |
| **LunarCrush**     | 소셜 메트릭                 | 제한적       | `lunarcrush.com/api`     |
| **Santiment**      | 소셜 + 온체인               | 유료         | -                        |

### 4. 트렌드 & 검색량

| 서비스            | 용도                      | 무료 Tier         | API               |
| ----------------- | ------------------------- | ----------------- | ----------------- |
| **Google Trends** | 검색량 트렌드             | 비공식 (pytrends) | 스크래핑          |
| **SerpApi**       | Google Trends 안정적      | 100 calls/월      | `serpapi.com`     |
| **Glimpse**       | Google Trends + 절대 볼륨 | 유료              | `meetglimpse.com` |

### 5. 거래소 API

| 거래소          | 용도                             | Rate Limit   |
| --------------- | -------------------------------- | ------------ |
| **Hyperliquid** | Perp 거래, 오더북 (Primary)      | 높음         |
| **Binance**     | Spot/Futures, 데이터 (Secondary) | 1200 req/min |

---

## 📈 추천 무료 API 조합

```typescript
// 1인 개인 봇 최적 조합
const dataStack = {
  // 가격 & 시장 데이터
  price: "CoinGecko", // 무료 30 calls/min, 충분함

  // DeFi & 온체인
  defi: "DeFiLlama", // 완전 무료, TVL/Yields

  // 센티먼트
  fearGreed: "Alternative.me", // 완전 무료, 일 1회 업데이트

  // 소셜 (옵션)
  social: "CoinPaprika", // 무료 + 소셜 시그널 포함

  // 거래 실행
  exchange: "Hyperliquid", // 낮은 수수료, 높은 레버리지
};
```

---

## 🔧 TypeScript 구현

```typescript
// src/services/external-data.service.ts

// ============================================
// CoinGecko API
// ============================================
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

interface CoinGeckoPrice {
  [coinId: string]: {
    usd: number;
    usd_market_cap: number;
    usd_24h_vol: number;
    usd_24h_change: number;
  };
}

export async function getCoinGeckoPrices(
  coinIds: string[]
): Promise<CoinGeckoPrice> {
  const ids = coinIds.join(",");
  const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;

  const res = await fetch(url);
  return res.json();
}

export async function getCoinGeckoMarkets(limit = 100): Promise<any[]> {
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;

  const res = await fetch(url);
  return res.json();
}

// FDV, IMC 조회 (프로젝트 선별용)
export async function getCoinDetails(coinId: string): Promise<{
  fdv: number;
  marketCap: number;
  circulatingSupply: number;
  totalSupply: number;
}> {
  const url = `${COINGECKO_BASE}/coins/${coinId}`;
  const res = await fetch(url);
  const data = await res.json();

  return {
    fdv: data.market_data?.fully_diluted_valuation?.usd || 0,
    marketCap: data.market_data?.market_cap?.usd || 0,
    circulatingSupply: data.market_data?.circulating_supply || 0,
    totalSupply: data.market_data?.total_supply || 0,
  };
}

// ============================================
// Alternative.me Fear & Greed Index
// ============================================
const FEAR_GREED_URL = "https://api.alternative.me/fng/";

interface FearGreedData {
  value: string;
  value_classification:
    | "Extreme Fear"
    | "Fear"
    | "Neutral"
    | "Greed"
    | "Extreme Greed";
  timestamp: string;
}

export async function getFearGreedIndex(limit = 1): Promise<FearGreedData[]> {
  const url = `${FEAR_GREED_URL}?limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data;
}

export async function getFearGreedHistory(days = 30): Promise<FearGreedData[]> {
  return getFearGreedIndex(days);
}

// ============================================
// DeFiLlama API
// ============================================
const DEFILLAMA_BASE = "https://api.llama.fi";

export async function getProtocolTVL(protocol: string): Promise<{
  tvl: number;
  change_1d: number;
  change_7d: number;
}> {
  const url = `${DEFILLAMA_BASE}/tvl/${protocol}`;
  const res = await fetch(url);
  const tvl = await res.json();

  // 변화율은 별도 API
  const protocolUrl = `${DEFILLAMA_BASE}/protocol/${protocol}`;
  const protocolRes = await fetch(protocolUrl);
  const protocolData = await protocolRes.json();

  return {
    tvl,
    change_1d: protocolData.change_1d || 0,
    change_7d: protocolData.change_7d || 0,
  };
}

export async function getAllProtocols(): Promise<any[]> {
  const url = `${DEFILLAMA_BASE}/protocols`;
  const res = await fetch(url);
  return res.json();
}

export async function getYieldPools(): Promise<any[]> {
  const url = "https://yields.llama.fi/pools";
  const res = await fetch(url);
  const data = await res.json();
  return data.data;
}

// ============================================
// Google Trends (SerpApi 사용)
// ============================================
const SERPAPI_KEY = process.env.SERPAPI_KEY;

export async function getGoogleTrends(keyword: string): Promise<{
  interestOverTime: number[];
  relatedQueries: string[];
}> {
  if (!SERPAPI_KEY) {
    console.warn("SERPAPI_KEY not set, skipping Google Trends");
    return { interestOverTime: [], relatedQueries: [] };
  }

  const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(keyword)}&api_key=${SERPAPI_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  return {
    interestOverTime:
      data.interest_over_time?.timeline_data?.map(
        (d: any) => d.values[0].value
      ) || [],
    relatedQueries:
      data.related_queries?.rising?.map((q: any) => q.query) || [],
  };
}

// ============================================
// 센티먼트 인덱스 계산
// ============================================
export async function calculateSentimentIndex(): Promise<{
  fearGreed: number;
  fearGreedClass: string;
  googleTrendsBTC: number;
  sentimentScore: number; // 0-100
  marketPhase: "accumulate" | "hold" | "reduce" | "exit";
}> {
  const [fgData, btcTrends] = await Promise.all([
    getFearGreedIndex(1),
    getGoogleTrends("bitcoin").catch(() => ({ interestOverTime: [50] })),
  ]);

  const fearGreed = parseInt(fgData[0]?.value || "50");
  const fearGreedClass = fgData[0]?.value_classification || "Neutral";

  // Google Trends 정규화 (최근 값)
  const recentTrend = btcTrends.interestOverTime.slice(-1)[0] || 50;

  // 종합 센티먼트 점수 (0-100)
  // Fear & Greed 70% + Google Trends 30%
  const sentimentScore = fearGreed * 0.7 + recentTrend * 0.3;

  // 행동 지침
  let marketPhase: "accumulate" | "hold" | "reduce" | "exit";
  if (sentimentScore < 25) {
    marketPhase = "accumulate"; // 극도의 공포 = 매수 기회
  } else if (sentimentScore < 50) {
    marketPhase = "hold";
  } else if (sentimentScore < 75) {
    marketPhase = "reduce";
  } else {
    marketPhase = "exit"; // 극도의 탐욕 = 익절 시작
  }

  return {
    fearGreed,
    fearGreedClass,
    googleTrendsBTC: recentTrend,
    sentimentScore,
    marketPhase,
  };
}
```

---

## ⚡ 트레이딩 전략 로직

### 1. Grid Bot 전략

```typescript
// src/strategies/grid-bot.strategy.ts

interface GridConfig {
  symbol: string;
  upperPrice: number;
  lowerPrice: number;
  gridCount: number; // 그리드 수 (10-20)
  totalCapital: number; // 투입 자본
  leverage: number; // 1-5x
  stopLossPercent: number; // 전체 손절 %
}

interface GridOrder {
  price: number;
  side: "buy" | "sell";
  size: number;
  status: "pending" | "filled" | "cancelled";
}

export class GridBotStrategy {
  private config: GridConfig;
  private grids: GridOrder[] = [];
  private filledBuys: number = 0;
  private totalPnL: number = 0;

  constructor(config: GridConfig) {
    this.config = config;
    this.initializeGrids();
  }

  // 그리드 초기화
  private initializeGrids(): void {
    const { upperPrice, lowerPrice, gridCount, totalCapital, leverage } =
      this.config;

    const gridSpacing = (upperPrice - lowerPrice) / gridCount;
    const sizePerGrid = (totalCapital * leverage) / gridCount;

    for (let i = 0; i <= gridCount; i++) {
      const price = lowerPrice + gridSpacing * i;

      this.grids.push({
        price,
        side: "buy", // 초기에는 모두 매수 대기
        size: sizePerGrid / price,
        status: "pending",
      });
    }

    console.log(
      `📊 Grid initialized: ${gridCount} levels from $${lowerPrice} to $${upperPrice}`
    );
  }

  // 현재가로 그리드 상태 업데이트
  onPriceUpdate(currentPrice: number): GridOrder[] {
    const executedOrders: GridOrder[] = [];

    for (const grid of this.grids) {
      if (grid.status !== "pending") continue;

      // 매수 조건: 가격이 그리드 레벨 아래로 내려감
      if (grid.side === "buy" && currentPrice <= grid.price) {
        grid.status = "filled";
        this.filledBuys++;

        // 매수 후 해당 레벨 위에 매도 주문 생성
        const sellPrice =
          grid.price +
          (this.config.upperPrice - this.config.lowerPrice) /
            this.config.gridCount;
        this.grids.push({
          price: sellPrice,
          side: "sell",
          size: grid.size,
          status: "pending",
        });

        executedOrders.push({ ...grid });
        console.log(`🟢 Grid BUY filled @ $${grid.price.toFixed(2)}`);
      }

      // 매도 조건: 가격이 그리드 레벨 위로 올라감
      if (grid.side === "sell" && currentPrice >= grid.price) {
        grid.status = "filled";

        const profit =
          grid.size *
          (grid.price -
            (grid.price -
              (this.config.upperPrice - this.config.lowerPrice) /
                this.config.gridCount));
        this.totalPnL += profit;

        executedOrders.push({ ...grid });
        console.log(
          `🔴 Grid SELL filled @ $${grid.price.toFixed(2)} | Profit: $${profit.toFixed(2)}`
        );
      }
    }

    return executedOrders;
  }

  // 그리드 재조정 (가격이 범위를 벗어났을 때)
  shouldRebalance(currentPrice: number): boolean {
    const { upperPrice, lowerPrice } = this.config;
    const range = upperPrice - lowerPrice;
    const threshold = range * 0.12; // 12% 범위 이탈 시 재조정

    return (
      currentPrice > upperPrice + threshold ||
      currentPrice < lowerPrice - threshold
    );
  }

  getStats() {
    return {
      totalPnL: this.totalPnL,
      filledBuys: this.filledBuys,
      activeGrids: this.grids.filter((g) => g.status === "pending").length,
    };
  }
}
```

---

### 2. Momentum 전략

```typescript
// src/strategies/momentum.strategy.ts

import type { IndicatorSnapshot } from "../services/indicators.service";

interface MomentumConfig {
  symbol: string;

  // RSI 설정
  rsiOversold: number; // 기본 30
  rsiOverbought: number; // 기본 70

  // Bollinger Bands
  bbStdDev: number; // 기본 2

  // ADX (추세 강도)
  adxThreshold: number; // 기본 25

  // 리스크 관리
  leverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
}

interface MomentumSignal {
  direction: "long" | "short" | "none";
  confidence: number; // 0-1
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  reasons: string[];
}

export class MomentumStrategy {
  private config: MomentumConfig;
  private lastSignal: MomentumSignal | null = null;

  constructor(config: MomentumConfig) {
    this.config = config;
  }

  // 시그널 생성
  generateSignal(
    indicators: IndicatorSnapshot,
    currentPrice: number
  ): MomentumSignal {
    const reasons: string[] = [];
    let longScore = 0;
    let shortScore = 0;

    // === LONG 조건 ===

    // 1. RSI 과매도
    if (indicators.rsi < this.config.rsiOversold) {
      longScore += 2;
      reasons.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
    }

    // 2. BB 하단 이탈
    if (indicators.bbPosition === "below_lower") {
      longScore += 2;
      reasons.push("Price below BB lower");
    }

    // 3. ADX 강한 추세 + DI+ > DI-
    if (
      indicators.adx > this.config.adxThreshold &&
      indicators.plusDI > indicators.minusDI
    ) {
      longScore += 1.5;
      reasons.push(`Strong bullish trend (ADX: ${indicators.adx.toFixed(1)})`);
    }

    // 4. EMA 정배열
    if (
      indicators.ema20 > indicators.ema50 &&
      indicators.ema50 > indicators.ema100
    ) {
      longScore += 1;
      reasons.push("EMA bullish alignment");
    }

    // 5. MACD 골든 크로스
    if (indicators.macdCrossover === "bullish") {
      longScore += 1.5;
      reasons.push("MACD bullish crossover");
    }

    // === SHORT 조건 ===

    // 1. RSI 과매수
    if (indicators.rsi > this.config.rsiOverbought) {
      shortScore += 2;
      reasons.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
    }

    // 2. BB 상단 이탈
    if (indicators.bbPosition === "above_upper") {
      shortScore += 2;
      reasons.push("Price above BB upper");
    }

    // 3. ADX 강한 추세 + DI- > DI+
    if (
      indicators.adx > this.config.adxThreshold &&
      indicators.minusDI > indicators.plusDI
    ) {
      shortScore += 1.5;
      reasons.push(`Strong bearish trend (ADX: ${indicators.adx.toFixed(1)})`);
    }

    // 4. EMA 역배열
    if (
      indicators.ema20 < indicators.ema50 &&
      indicators.ema50 < indicators.ema100
    ) {
      shortScore += 1;
      reasons.push("EMA bearish alignment");
    }

    // 5. MACD 데드 크로스
    if (indicators.macdCrossover === "bearish") {
      shortScore += 1.5;
      reasons.push("MACD bearish crossover");
    }

    // === 시그널 결정 ===
    const totalScore = longScore + shortScore;
    let direction: "long" | "short" | "none" = "none";
    let confidence = 0;

    if (longScore >= 4 && longScore > shortScore * 1.5) {
      direction = "long";
      confidence = Math.min(1, longScore / 8);
    } else if (shortScore >= 4 && shortScore > longScore * 1.5) {
      direction = "short";
      confidence = Math.min(1, shortScore / 8);
    }

    // TP/SL 계산
    const stopLoss =
      direction === "long"
        ? currentPrice * (1 - this.config.stopLossPercent / 100)
        : currentPrice * (1 + this.config.stopLossPercent / 100);

    const takeProfit =
      direction === "long"
        ? currentPrice * (1 + this.config.takeProfitPercent / 100)
        : currentPrice * (1 - this.config.takeProfitPercent / 100);

    const signal: MomentumSignal = {
      direction,
      confidence,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      reasons,
    };

    this.lastSignal = signal;
    return signal;
  }

  // Trailing Stop 업데이트
  updateTrailingStop(
    currentPrice: number,
    position: "long" | "short",
    currentSL: number
  ): number {
    const { trailingStopPercent } = this.config;

    if (position === "long") {
      const newSL = currentPrice * (1 - trailingStopPercent / 100);
      return Math.max(currentSL, newSL);
    } else {
      const newSL = currentPrice * (1 + trailingStopPercent / 100);
      return Math.min(currentSL, newSL);
    }
  }
}
```

---

### 3. 스캘핑 전략 (일당벌이용)

```typescript
// src/strategies/scalping.strategy.ts

interface ScalpingConfig {
  symbol: string;
  timeframe: "1m" | "5m"; // 1분 또는 5분봉

  // 진입 조건
  rsiLow: number; // 25
  rsiHigh: number; // 75

  // 목표 수익
  targetProfitPercent: number; // 0.3-0.5%
  stopLossPercent: number; // 0.2-0.3%

  // 필터
  minVolume24h: number; // 최소 거래량
  maxSpreadPercent: number; // 최대 스프레드

  // 세션
  maxDailyTrades: number; // 일일 최대 거래 수
  maxDailyLoss: number; // 일일 최대 손실 $
}

interface ScalpTrade {
  entryTime: Date;
  entryPrice: number;
  side: "long" | "short";
  targetPrice: number;
  stopPrice: number;
  status: "open" | "won" | "lost";
  pnl?: number;
}

export class ScalpingStrategy {
  private config: ScalpingConfig;
  private todayTrades: ScalpTrade[] = [];
  private todayPnL: number = 0;

  constructor(config: ScalpingConfig) {
    this.config = config;
  }

  // 스캘핑 진입 조건 체크
  checkEntry(
    rsi: number,
    bidPrice: number,
    askPrice: number,
    volume24h: number
  ): { canTrade: boolean; side?: "long" | "short"; reason?: string } {
    // 일일 한도 체크
    if (this.todayTrades.length >= this.config.maxDailyTrades) {
      return { canTrade: false, reason: "Daily trade limit reached" };
    }

    if (this.todayPnL <= -this.config.maxDailyLoss) {
      return { canTrade: false, reason: "Daily loss limit reached" };
    }

    // 볼륨 체크
    if (volume24h < this.config.minVolume24h) {
      return { canTrade: false, reason: "Insufficient volume" };
    }

    // 스프레드 체크
    const spread = ((askPrice - bidPrice) / bidPrice) * 100;
    if (spread > this.config.maxSpreadPercent) {
      return {
        canTrade: false,
        reason: `Spread too wide: ${spread.toFixed(3)}%`,
      };
    }

    // RSI 기반 진입
    if (rsi < this.config.rsiLow) {
      return {
        canTrade: true,
        side: "long",
        reason: `RSI oversold: ${rsi.toFixed(1)}`,
      };
    }

    if (rsi > this.config.rsiHigh) {
      return {
        canTrade: true,
        side: "short",
        reason: `RSI overbought: ${rsi.toFixed(1)}`,
      };
    }

    return { canTrade: false, reason: "No signal" };
  }

  // 포지션 열기
  openPosition(side: "long" | "short", entryPrice: number): ScalpTrade {
    const { targetProfitPercent, stopLossPercent } = this.config;

    const targetPrice =
      side === "long"
        ? entryPrice * (1 + targetProfitPercent / 100)
        : entryPrice * (1 - targetProfitPercent / 100);

    const stopPrice =
      side === "long"
        ? entryPrice * (1 - stopLossPercent / 100)
        : entryPrice * (1 + stopLossPercent / 100);

    const trade: ScalpTrade = {
      entryTime: new Date(),
      entryPrice,
      side,
      targetPrice,
      stopPrice,
      status: "open",
    };

    this.todayTrades.push(trade);

    console.log(`⚡ Scalp ${side.toUpperCase()} @ $${entryPrice.toFixed(2)}`);
    console.log(
      `   Target: $${targetPrice.toFixed(2)} | Stop: $${stopPrice.toFixed(2)}`
    );

    return trade;
  }

  // 포지션 체크 (TP/SL 도달 여부)
  checkPosition(trade: ScalpTrade, currentPrice: number): "hold" | "tp" | "sl" {
    if (trade.status !== "open") return "hold";

    if (trade.side === "long") {
      if (currentPrice >= trade.targetPrice) return "tp";
      if (currentPrice <= trade.stopPrice) return "sl";
    } else {
      if (currentPrice <= trade.targetPrice) return "tp";
      if (currentPrice >= trade.stopPrice) return "sl";
    }

    return "hold";
  }

  // 포지션 종료
  closePosition(
    trade: ScalpTrade,
    exitPrice: number,
    reason: "tp" | "sl"
  ): void {
    const pnl =
      trade.side === "long"
        ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100;

    trade.status = reason === "tp" ? "won" : "lost";
    trade.pnl = pnl;
    this.todayPnL += pnl;

    const emoji = reason === "tp" ? "✅" : "❌";
    console.log(
      `${emoji} Scalp closed: ${pnl.toFixed(3)}% | Daily: ${this.todayPnL.toFixed(3)}%`
    );
  }

  // 일일 통계
  getDailyStats() {
    const wins = this.todayTrades.filter((t) => t.status === "won").length;
    const losses = this.todayTrades.filter((t) => t.status === "lost").length;
    const open = this.todayTrades.filter((t) => t.status === "open").length;

    return {
      totalTrades: this.todayTrades.length,
      wins,
      losses,
      open,
      winRate: wins / (wins + losses) || 0,
      totalPnL: this.todayPnL,
      remainingTrades: this.config.maxDailyTrades - this.todayTrades.length,
    };
  }

  // 일일 리셋
  resetDaily(): void {
    this.todayTrades = [];
    this.todayPnL = 0;
    console.log("🔄 Daily scalping stats reset");
  }
}
```

---

### 4. Funding Rate Arbitrage

```typescript
// src/strategies/funding-arb.strategy.ts

interface FundingArbConfig {
  symbols: string[];
  minFundingRate: number; // 최소 펀딩비 (0.01% = 0.0001)
  positionSizePercent: number; // 자본의 몇 %
  maxConcurrent: number; // 최대 동시 포지션
}

interface FundingPosition {
  symbol: string;
  side: "short" | "long"; // 펀딩 받는 방향
  entryPrice: number;
  size: number;
  fundingRate: number;
  accumulatedFunding: number;
  openTime: Date;
}

export class FundingArbStrategy {
  private config: FundingArbConfig;
  private positions: FundingPosition[] = [];

  constructor(config: FundingArbConfig) {
    this.config = config;
  }

  // 펀딩비 체크 및 진입 결정
  checkFundingOpportunity(
    symbol: string,
    fundingRate: number,
    nextFundingTime: Date
  ): { shouldEnter: boolean; side: "short" | "long"; reason: string } {
    // 이미 포지션 있는지 체크
    if (this.positions.find((p) => p.symbol === symbol)) {
      return {
        shouldEnter: false,
        side: "short",
        reason: "Position already exists",
      };
    }

    // 동시 포지션 한도 체크
    if (this.positions.length >= this.config.maxConcurrent) {
      return {
        shouldEnter: false,
        side: "short",
        reason: "Max concurrent positions reached",
      };
    }

    // 펀딩비가 임계값 이상인지
    const absRate = Math.abs(fundingRate);
    if (absRate < this.config.minFundingRate) {
      return {
        shouldEnter: false,
        side: "short",
        reason: `Funding rate too low: ${(fundingRate * 100).toFixed(4)}%`,
      };
    }

    // 진입 방향 결정
    // 펀딩비 양수 = Long이 Short에게 지불 → Short 포지션으로 펀딩 수령
    // 펀딩비 음수 = Short이 Long에게 지불 → Long 포지션으로 펀딩 수령
    const side: "short" | "long" = fundingRate > 0 ? "short" : "long";

    return {
      shouldEnter: true,
      side,
      reason: `Funding rate: ${(fundingRate * 100).toFixed(4)}% (${side} to receive)`,
    };
  }

  // 포지션 열기
  openPosition(
    symbol: string,
    side: "short" | "long",
    entryPrice: number,
    fundingRate: number,
    capital: number
  ): FundingPosition {
    const size = (capital * this.config.positionSizePercent) / 100 / entryPrice;

    const position: FundingPosition = {
      symbol,
      side,
      entryPrice,
      size,
      fundingRate,
      accumulatedFunding: 0,
      openTime: new Date(),
    };

    this.positions.push(position);

    console.log(`💰 Funding Arb opened: ${symbol} ${side.toUpperCase()}`);
    console.log(`   Funding Rate: ${(fundingRate * 100).toFixed(4)}%`);

    return position;
  }

  // 펀딩 수령 기록
  recordFunding(symbol: string, fundingAmount: number): void {
    const position = this.positions.find((p) => p.symbol === symbol);
    if (position) {
      position.accumulatedFunding += fundingAmount;
      console.log(
        `💵 Funding received: ${symbol} $${fundingAmount.toFixed(4)}`
      );
    }
  }

  // 포지션 종료 조건 체크
  shouldClose(symbol: string, currentFundingRate: number): boolean {
    const position = this.positions.find((p) => p.symbol === symbol);
    if (!position) return false;

    // 펀딩 방향이 바뀌면 종료
    const wasPositive = position.fundingRate > 0;
    const isNowPositive = currentFundingRate > 0;

    if (wasPositive !== isNowPositive) {
      console.log(
        `⚠️ Funding direction changed for ${symbol}, closing position`
      );
      return true;
    }

    // 펀딩비가 너무 낮아지면 종료
    if (Math.abs(currentFundingRate) < this.config.minFundingRate * 0.5) {
      console.log(`⚠️ Funding rate too low for ${symbol}, closing position`);
      return true;
    }

    return false;
  }

  // 예상 APY 계산
  calculateAPY(fundingRate: number): number {
    // Hyperliquid은 1시간마다 펀딩
    // APY = hourly_rate * 24 * 365
    return fundingRate * 24 * 365 * 100;
  }

  getPositions(): FundingPosition[] {
    return this.positions;
  }
}
```

---

## 📊 전략 요약

| 전략            | 시간대  | 목표 수익 | 리스크 | 적합 시장 |
| --------------- | ------- | --------- | ------ | --------- |
| **Grid Bot**    | 시간~일 | 월 5-15%  | 낮음   | 횡보장    |
| **Momentum**    | 시간~일 | 월 10-30% | 중간   | 추세장    |
| **Scalping**    | 분      | 일 0.5-2% | 높음   | 변동성    |
| **Funding Arb** | 시간    | 월 3-5%   | 낮음   | 모든 시장 |

---

## 🎯 $1,000 → $10,000 전략 조합

```typescript
const portfolioAllocation = {
  gridBot: 0.4, // $400 - 안정적 횡보장 수익
  momentum: 0.3, // $300 - 추세장 고수익
  scalping: 0.15, // $150 - 일당벌이
  fundingArb: 0.1, // $100 - 패시브 인컴
  reserve: 0.05, // $50 - 예비금
};

// 월별 목표 (복리)
// 1월: $1,000 → $1,400 (40%)
// 2월: $1,400 → $1,960 (40%)
// 3월: $1,960 → $2,744 (40%)
// 4월: $2,744 → $3,842 (40%)
// 5월: $3,842 → $5,379 (40%)
// 6월: $5,379 → $7,530 (40%)
// + IDO 1개 성공 (5x): +$2,500
// = 약 $10,000 달성 가능
```
