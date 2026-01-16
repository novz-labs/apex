// src/jobs/sentiment-updater.job.ts

/**
 * 센티먼트 업데이터 Job
 * - Fear & Greed Index 조회
 * - 마켓 페이즈 계산
 */

const FEAR_GREED_URL = "https://api.alternative.me/fng/";

interface FearGreedData {
  value: number;
  classification: string;
  timestamp: string;
  marketPhase: "accumulate" | "hold" | "reduce" | "exit";
}

// 인메모리 센티먼트 저장소
let currentSentiment: FearGreedData | null = null;
const sentimentHistory: FearGreedData[] = [];
const MAX_HISTORY = 168; // 7일 * 24시간

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

    currentSentiment = {
      value,
      classification,
      timestamp: new Date().toISOString(),
      marketPhase,
    };

    // 히스토리에 추가
    sentimentHistory.push(currentSentiment);
    if (sentimentHistory.length > MAX_HISTORY) {
      sentimentHistory.shift();
    }

    console.log(`📊 Sentiment: ${value} (${classification}) → ${marketPhase}`);
  } catch (error) {
    console.error("❌ Sentiment update failed:", error);
  }
}

/**
 * 마켓 페이즈 계산
 */
function calculateMarketPhase(
  value: number
): "accumulate" | "hold" | "reduce" | "exit" {
  if (value < 25) return "accumulate"; // 극도의 공포 = 매수 기회
  if (value < 50) return "hold";
  if (value < 75) return "reduce";
  return "exit"; // 극도의 탐욕 = 익절
}

/**
 * 현재 센티먼트 조회
 */
export function getCurrentSentiment(): FearGreedData | null {
  return currentSentiment;
}

/**
 * 센티먼트 히스토리 조회
 */
export function getSentimentHistory(limit?: number): FearGreedData[] {
  if (limit) {
    return sentimentHistory.slice(-limit);
  }
  return [...sentimentHistory];
}

/**
 * 센티먼트 추세 분석
 */
export function getSentimentTrend(): {
  current: number | null;
  average24h: number | null;
  trend: "improving" | "worsening" | "stable" | "unknown";
} {
  if (!currentSentiment) {
    return { current: null, average24h: null, trend: "unknown" };
  }

  const last24 = sentimentHistory.slice(-24);
  if (last24.length < 2) {
    return {
      current: currentSentiment.value,
      average24h: null,
      trend: "unknown",
    };
  }

  const average = last24.reduce((sum, s) => sum + s.value, 0) / last24.length;
  const first = last24[0].value;
  const last = last24[last24.length - 1].value;

  let trend: "improving" | "worsening" | "stable";
  if (last - first > 5) {
    trend = "improving";
  } else if (first - last > 5) {
    trend = "worsening";
  } else {
    trend = "stable";
  }

  return {
    current: currentSentiment.value,
    average24h: Math.round(average),
    trend,
  };
}
