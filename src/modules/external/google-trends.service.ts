// src/modules/external/google-trends.service.ts

// ============================================
// Google Trends via SerpAPI
// ============================================

interface TrendData {
  keyword: string;
  interestOverTime: Array<{
    date: string;
    value: number;
  }>;
  averageInterest: number;
  trend: "rising" | "stable" | "declining";
  relatedQueries: Array<{
    query: string;
    value: number;
  }>;
}

interface TrendComparison {
  keywords: string[];
  winner: string;
  data: Record<string, number>;
}

const SERP_API_BASE = "https://serpapi.com/search.json";

/**
 * Google Trends 데이터 조회 (단일 키워드)
 */
export async function getTrendData(
  keyword: string,
  timeframe:
    | "now 1-d"
    | "now 7-d"
    | "today 1-m"
    | "today 3-m"
    | "today 12-m" = "now 7-d"
): Promise<TrendData | null> {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    console.warn("[GoogleTrends] SERPAPI_KEY not configured");
    return null;
  }

  try {
    const params = new URLSearchParams({
      engine: "google_trends",
      q: keyword,
      date: timeframe,
      api_key: apiKey,
    });

    const response = await fetch(`${SERP_API_BASE}?${params}`);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[GoogleTrends] API error: ${error}`);
      return null;
    }

    const data = (await response.json()) as {
      interest_over_time?: {
        timeline_data?: Array<{
          date: string;
          values: Array<{ value: string }>;
        }>;
      };
      related_queries?: {
        rising?: Array<{
          query: string;
          value: number;
        }>;
      };
    };

    // 타임라인 데이터 추출
    const timelineData = data.interest_over_time?.timeline_data ?? [];
    const interestOverTime = timelineData.map((item) => ({
      date: item.date,
      value: parseInt(item.values[0]?.value || "0", 10),
    }));

    // 평균 관심도 계산
    const values = interestOverTime.map((i) => i.value);
    const averageInterest =
      values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    // 트렌드 방향 판단
    const recentAvg = values.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

    let trend: "rising" | "stable" | "declining" = "stable";
    if (recentAvg > olderAvg * 1.2) trend = "rising";
    else if (recentAvg < olderAvg * 0.8) trend = "declining";

    // 관련 쿼리
    const relatedQueries = (data.related_queries?.rising ?? [])
      .slice(0, 5)
      .map((q) => ({
        query: q.query,
        value: q.value,
      }));

    return {
      keyword,
      interestOverTime,
      averageInterest,
      trend,
      relatedQueries,
    };
  } catch (error) {
    console.error(`[GoogleTrends] Failed to fetch: ${error}`);
    return null;
  }
}

/**
 * 여러 키워드 트렌드 비교
 */
export async function compareTrends(
  keywords: string[],
  timeframe: "now 7-d" | "today 1-m" | "today 3-m" = "now 7-d"
): Promise<TrendComparison | null> {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    console.warn("[GoogleTrends] SERPAPI_KEY not configured");
    return null;
  }

  try {
    const params = new URLSearchParams({
      engine: "google_trends",
      q: keywords.join(","),
      date: timeframe,
      api_key: apiKey,
    });

    const response = await fetch(`${SERP_API_BASE}?${params}`);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      interest_over_time?: {
        timeline_data?: Array<{
          values: Array<{
            query: string;
            value: string;
          }>;
        }>;
      };
    };

    const timelineData = data.interest_over_time?.timeline_data ?? [];

    // 각 키워드의 평균 관심도 계산
    const averages: Record<string, number> = {};

    for (const kw of keywords) {
      const values: number[] = [];
      for (const item of timelineData) {
        const match = item.values.find(
          (v) => v.query.toLowerCase() === kw.toLowerCase()
        );
        if (match) {
          values.push(parseInt(match.value || "0", 10));
        }
      }
      averages[kw] =
        values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
    }

    // 승자 판단
    const winner = Object.entries(averages).reduce((a, b) =>
      a[1] > b[1] ? a : b
    )[0];

    return {
      keywords,
      winner,
      data: averages,
    };
  } catch (error) {
    console.error(`[GoogleTrends] Failed to compare: ${error}`);
    return null;
  }
}

/**
 * 크립토 관련 검색 트렌드 조회
 */
export async function getCryptoTrend(): Promise<{
  bitcoin: number;
  ethereum: number;
  crypto: number;
  marketSentiment: "bullish" | "neutral" | "bearish";
} | null> {
  const comparison = await compareTrends(
    ["bitcoin", "ethereum", "crypto"],
    "now 7-d"
  );

  if (!comparison) return null;

  const btc = comparison.data["bitcoin"] || 0;
  const eth = comparison.data["ethereum"] || 0;
  const crypto = comparison.data["crypto"] || 0;

  // 검색 관심도 기반 시장 센티먼트 추정
  // 높은 관심도 = 더 많은 관심 = 잠재적 상승세
  const avgInterest = (btc + eth + crypto) / 3;

  let marketSentiment: "bullish" | "neutral" | "bearish" = "neutral";
  if (avgInterest > 60) marketSentiment = "bullish";
  else if (avgInterest < 30) marketSentiment = "bearish";

  return {
    bitcoin: btc,
    ethereum: eth,
    crypto,
    marketSentiment,
  };
}

/**
 * 특정 코인의 검색 트렌드 분석
 */
export async function getCoinSearchTrend(symbol: string): Promise<{
  symbol: string;
  searchInterest: number;
  trend: "rising" | "stable" | "declining";
  relatedQueries: string[];
} | null> {
  // 코인 이름 매핑
  const coinNames: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    DOGE: "dogecoin",
    ARB: "arbitrum",
    XRP: "ripple",
    ADA: "cardano",
    AVAX: "avalanche",
    DOT: "polkadot",
    LINK: "chainlink",
  };

  const searchTerm = coinNames[symbol.toUpperCase()] || symbol.toLowerCase();
  const data = await getTrendData(searchTerm, "now 7-d");

  if (!data) return null;

  return {
    symbol: symbol.toUpperCase(),
    searchInterest: data.averageInterest,
    trend: data.trend,
    relatedQueries: data.relatedQueries.map((q) => q.query),
  };
}
