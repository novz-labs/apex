// src/api/routes/external.ts
import { Elysia, t } from "elysia";
import * as CoinGecko from "../../modules/external/coingecko.service";
import * as DeFiLlama from "../../modules/external/defillama.service";
import * as GoogleTrends from "../../modules/external/google-trends.service";
import * as Sentiment from "../../modules/external/sentiment.service";

// ============================================
// CoinGecko 스키마
// ============================================
const CoinGeckoSchema = {
  pricesQuery: t.Object({
    coinIds: t.String({
      description: "Comma-separated coin IDs (e.g. bitcoin,ethereum)",
    }),
  }),
  pricesRes: t.Record(
    t.String(),
    t.Object({
      usd: t.Number(),
      usd_market_cap: t.Number(),
      usd_24h_vol: t.Number(),
      usd_24h_change: t.Number(),
    })
  ),

  coinParams: t.Object({
    coinId: t.String(),
  }),
  coinRes: t.Object({
    fdv: t.Number(),
    marketCap: t.Number(),
    circulatingSupply: t.Number(),
    totalSupply: t.Number(),
  }),

  marketsQuery: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 250, default: 100 })),
  }),
  marketsRes: t.Array(
    t.Object({
      id: t.String(),
      symbol: t.String(),
      name: t.String(),
      current_price: t.Number(),
      market_cap: t.Number(),
      market_cap_rank: t.Number(),
      price_change_percentage_24h: t.Number(),
    })
  ),
};

// ============================================
// DeFiLlama 스키마
// ============================================
const DeFiLlamaSchema = {
  tvlParams: t.Object({
    protocol: t.String(),
  }),
  tvlRes: t.Object({
    tvl: t.Number(),
    change_1d: t.Number(),
    change_7d: t.Number(),
  }),

  protocolsRes: t.Array(
    t.Object({
      name: t.String(),
      tvl: t.Number(),
      chainTvls: t.Record(t.String(), t.Number()),
      change_1d: t.Optional(t.Number()),
      change_7d: t.Optional(t.Number()),
    })
  ),

  yieldsQuery: t.Object({
    limit: t.Optional(t.Number({ default: 50 })),
  }),
  yieldsRes: t.Array(
    t.Object({
      pool: t.String(),
      project: t.String(),
      chain: t.String(),
      apy: t.Number(),
      tvlUsd: t.Number(),
    })
  ),
};

// ============================================
// Sentiment 스키마
// ============================================
const SentimentSchema = {
  fearGreedRes: t.Object({
    value: t.Number(),
    classification: t.String(),
    marketPhase: t.String(),
    timestamp: t.String(),
  }),

  historyQuery: t.Object({
    days: t.Optional(t.Number({ minimum: 1, maximum: 90, default: 30 })),
  }),
  historyRes: t.Array(
    t.Object({
      value: t.Number(),
      classification: t.String(),
      timestamp: t.String(),
    })
  ),
};

// ============================================
// 라우트 정의
// ============================================
export const externalRoutes = new Elysia({ prefix: "/external" })

  // --- CoinGecko ---
  .get(
    "/coingecko/prices",
    async ({ query }) => {
      const coinIds = query.coinIds.split(",").map((id) => id.trim());
      return CoinGecko.getPrices(coinIds);
    },
    {
      query: CoinGeckoSchema.pricesQuery,
      response: CoinGeckoSchema.pricesRes,
      detail: {
        tags: ["External - CoinGecko"],
        summary: "코인 가격 조회",
        description: "여러 코인의 현재 가격, 시가총액, 24시간 변동률 조회",
      },
    }
  )

  .get(
    "/coingecko/coin/:coinId",
    async ({ params }) => {
      return CoinGecko.getCoinDetails(params.coinId);
    },
    {
      params: CoinGeckoSchema.coinParams,
      response: CoinGeckoSchema.coinRes,
      detail: {
        tags: ["External - CoinGecko"],
        summary: "코인 상세 정보",
        description: "FDV, 유통량, 총 공급량 등 상세 정보 조회",
      },
    }
  )

  .get(
    "/coingecko/markets",
    async ({ query }) => {
      return CoinGecko.getMarkets(query.limit || 100);
    },
    {
      query: CoinGeckoSchema.marketsQuery,
      response: CoinGeckoSchema.marketsRes,
      detail: {
        tags: ["External - CoinGecko"],
        summary: "시장 목록 조회",
        description: "시가총액 순 코인 목록 조회",
      },
    }
  )

  // --- DeFiLlama ---
  .get(
    "/defillama/tvl/:protocol",
    async ({ params }) => {
      return DeFiLlama.getProtocolTVL(params.protocol);
    },
    {
      params: DeFiLlamaSchema.tvlParams,
      response: DeFiLlamaSchema.tvlRes,
      detail: {
        tags: ["External - DeFiLlama"],
        summary: "프로토콜 TVL 조회",
        description: "특정 DeFi 프로토콜의 TVL 및 변화율 조회",
      },
    }
  )

  .get(
    "/defillama/protocols",
    async () => {
      return DeFiLlama.getAllProtocols();
    },
    {
      response: DeFiLlamaSchema.protocolsRes,
      detail: {
        tags: ["External - DeFiLlama"],
        summary: "전체 프로토콜 목록",
        description: "모든 DeFi 프로토콜 TVL 목록 조회",
      },
    }
  )

  .get(
    "/defillama/yields",
    async ({ query }) => {
      return DeFiLlama.getYieldPools(query.limit || 50);
    },
    {
      query: DeFiLlamaSchema.yieldsQuery,
      response: DeFiLlamaSchema.yieldsRes,
      detail: {
        tags: ["External - DeFiLlama"],
        summary: "Yield Pool 목록",
        description: "DeFi Yield Pool 목록 및 APY 조회",
      },
    }
  )

  // --- Sentiment ---
  .get(
    "/sentiment/fear-greed",
    async () => {
      return Sentiment.getFearGreedIndex();
    },
    {
      response: SentimentSchema.fearGreedRes,
      detail: {
        tags: ["External - Sentiment"],
        summary: "Fear & Greed Index",
        description: "현재 공포/탐욕 지수 및 마켓 페이즈 조회",
      },
    }
  )

  .get(
    "/sentiment/history",
    async ({ query }) => {
      return Sentiment.getFearGreedHistory(query.days || 30);
    },
    {
      query: SentimentSchema.historyQuery,
      response: SentimentSchema.historyRes,
      detail: {
        tags: ["External - Sentiment"],
        summary: "Fear & Greed 히스토리",
        description: "과거 공포/탐욕 지수 히스토리 조회",
      },
    }
  )

  // ============================================
  // Google Trends (SerpAPI)
  // ============================================

  .get(
    "/trends/crypto",
    async () => {
      const data = await GoogleTrends.getCryptoTrend();
      if (!data) {
        return { error: "Failed to fetch trends. Check SERPAPI_KEY." };
      }
      return data;
    },
    {
      detail: {
        tags: ["External - Trends"],
        summary: "크립토 검색 트렌드",
        description:
          "Bitcoin, Ethereum, Crypto 키워드 검색 트렌드 및 시장 센티먼트",
      },
    }
  )

  .get(
    "/trends/compare",
    async ({ query }) => {
      const keywords = query.keywords.split(",").map((k: string) => k.trim());
      const data = await GoogleTrends.compareTrends(keywords);
      if (!data) {
        return { error: "Failed to compare trends" };
      }
      return data;
    },
    {
      query: t.Object({
        keywords: t.String({
          description:
            "비교할 키워드들 (쉼표 구분, 예: bitcoin,ethereum,solana)",
        }),
      }),
      detail: {
        tags: ["External - Trends"],
        summary: "트렌드 비교",
        description: "여러 키워드의 검색 트렌드 비교",
      },
    }
  )

  .get(
    "/trends/:symbol",
    async ({ params, set }) => {
      const data = await GoogleTrends.getCoinSearchTrend(params.symbol);
      if (!data) {
        set.status = 404;
        return { error: "Failed to fetch trend for symbol" };
      }
      return data;
    },
    {
      params: t.Object({
        symbol: t.String({ description: "코인 심볼 (예: BTC, SOL, doge)" }),
      }),
      detail: {
        tags: ["External - Trends"],
        summary: "코인별 검색 트렌드",
        description: "특정 코인의 Google 검색 트렌드 분석",
      },
    }
  );
