import { prisma } from "@db/prisma";
import type { SentimentData } from "@generated/prisma/client";

const FEAR_GREED_URL = "https://api.alternative.me/fng/";

export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: string;
  marketPhase: string;
}

/**
 * 센티먼트 업데이트 실행
 */
export async function runSentimentUpdater(): Promise<void> {
  try {
    const res = await fetch(`${FEAR_GREED_URL}?limit=1`);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const fgData = data.data[0];

    const value = parseInt(fgData.value);
    const classification = fgData.value_classification;
    const marketPhase = calculateMarketPhase(value);
    const timestamp = new Date();

    await prisma.sentimentData.create({
      data: {
        fearGreedIndex: value,
        fearGreedClass: classification,
        marketPhase,
        sentimentScore: value,
      },
    });

    console.log(
      `📊 Sentiment saved: ${value} (${classification}) → ${marketPhase}`
    );
  } catch (error) {
    console.error("❌ Sentiment update failed:", error);
  }
}

/**
 * 마켓 페이즈 계산
 */
function calculateMarketPhase(value: number): string {
  if (value < 25) return "accumulate";
  if (value < 50) return "hold";
  if (value < 75) return "reduce";
  return "exit";
}

/**
 * 현재 센티먼트 조회
 */
export async function getCurrentSentiment(): Promise<FearGreedData | null> {
  const latest = await prisma.sentimentData.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!latest) return null;

  return {
    value: latest.fearGreedIndex,
    classification: latest.fearGreedClass,
    timestamp: latest.createdAt.toISOString(),
    marketPhase: latest.marketPhase,
  };
}

/**
 * 센티먼트 히스토리 조회
 */
export async function getSentimentHistory(
  limit: number = 24
): Promise<FearGreedData[]> {
  const data = await prisma.sentimentData.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return data.map((s: SentimentData) => ({
    value: s.fearGreedIndex,
    classification: s.fearGreedClass,
    timestamp: s.createdAt.toISOString(),
    marketPhase: s.marketPhase,
  }));
}

/**
 * 센티먼트 트렌드 분석
 */
export async function getSentimentTrend(
  hours: number = 24
): Promise<{
  current: number;
  average: number;
  trend: "improving" | "worsening" | "stable";
  change: number;
}> {
  const data = await prisma.sentimentData.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - hours * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (data.length === 0) {
    return {
      current: 50,
      average: 50,
      trend: "stable",
      change: 0,
    };
  }

  const current = data[data.length - 1].fearGreedIndex;
  const average =
    data.reduce((sum, d) => sum + d.fearGreedIndex, 0) / data.length;

  // 최근 절반과 이전 절반 비교
  const midpoint = Math.floor(data.length / 2);
  const recentHalf = data.slice(midpoint);
  const olderHalf = data.slice(0, midpoint);

  const recentAvg =
    recentHalf.length > 0
      ? recentHalf.reduce((sum, d) => sum + d.fearGreedIndex, 0) /
        recentHalf.length
      : average;
  const olderAvg =
    olderHalf.length > 0
      ? olderHalf.reduce((sum, d) => sum + d.fearGreedIndex, 0) /
        olderHalf.length
      : average;

  const change = recentAvg - olderAvg;

  let trend: "improving" | "worsening" | "stable";
  if (change > 5) trend = "improving";
  else if (change < -5) trend = "worsening";
  else trend = "stable";

  return {
    current,
    average,
    trend,
    change,
  };
}
