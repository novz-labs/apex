// src/api/routes/external.ts
import { Elysia, t } from "elysia";

// ============================================
// CoinGecko 스키마
// ============================================
const CoinGeckoSchema = {
  // GET /external/coingecko/prices
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

  // GET /external/coingecko/coin/:coinId
  coinParams: t.Object({
    coinId: t.String(),
  }),
  coinRes: t.Object({
    fdv: t.Number(),
    marketCap: t.Number(),
    circulatingSupply: t.Number(),
    totalSupply: t.Number(),
  }),

  // GET /external/coingecko/markets
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
  // GET /external/defillama/tvl/:protocol
  tvlParams: t.Object({
    protocol: t.String(),
  }),
  tvlRes: t.Object({
    tvl: t.Number(),
    change_1d: t.Number(),
    change_7d: t.Number(),
  }),

  // GET /external/defillama/protocols
  protocolsRes: t.Array(
    t.Object({
      name: t.String(),
      tvl: t.Number(),
      chainTvls: t.Record(t.String(), t.Number()),
      change_1d: t.Optional(t.Number()),
      change_7d: t.Optional(t.Number()),
    })
  ),

  // GET /external/defillama/yields
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
// Sentiment (Fear & Greed) 스키마
// ============================================
const SentimentSchema = {
  // GET /external/sentiment/fear-greed
  fearGreedRes: t.Object({
    value: t.Number(),
    classification: t.String(),
    marketPhase: t.String(),
    timestamp: t.String(),
  }),

  // GET /external/sentiment/history
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
// Google Trends 스키마 (옵션)
// ============================================
const GoogleTrendsSchema = {
  // GET /external/trends/:keyword
  params: t.Object({
    keyword: t.String(),
  }),
  res: t.Object({
    keyword: t.String(),
    interestOverTime: t.Array(t.Number()),
    relatedQueries: t.Array(t.String()),
  }),
};

// ============================================
// 라우트 정의
// ============================================
export const externalRoutes = new Elysia({ prefix: "/external" })

  // --- CoinGecko ---
  .get(
    "/coingecko/prices",
    async ({ query }) => {
      // TODO: Implement coinGeckoService.getPrices(query.coinIds.split(","))
      throw new Error("Not implemented");
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
      // TODO: Implement coinGeckoService.getCoinDetails(params.coinId)
      throw new Error("Not implemented");
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
      // TODO: Implement coinGeckoService.getMarkets(query.limit)
      throw new Error("Not implemented");
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
      // TODO: Implement defiLlamaService.getProtocolTVL(params.protocol)
      throw new Error("Not implemented");
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
      // TODO: Implement defiLlamaService.getAllProtocols()
      throw new Error("Not implemented");
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
      // TODO: Implement defiLlamaService.getYieldPools(query.limit)
      throw new Error("Not implemented");
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
      // TODO: Implement sentimentService.getFearGreedIndex()
      throw new Error("Not implemented");
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
      // TODO: Implement sentimentService.getFearGreedHistory(query.days)
      throw new Error("Not implemented");
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

  // --- Google Trends (옵션) ---
  .get(
    "/trends/:keyword",
    async ({ params }) => {
      // TODO: Implement serpApiService.getGoogleTrends(params.keyword)
      throw new Error("Not implemented");
    },
    {
      params: GoogleTrendsSchema.params,
      response: GoogleTrendsSchema.res,
      detail: {
        tags: ["External - Trends"],
        summary: "Google Trends 조회",
        description: "키워드의 검색량 트렌드 및 관련 쿼리 조회 (SerpApi 필요)",
      },
    }
  );
