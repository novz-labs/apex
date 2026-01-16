// src/modules/external/sentiment.service.ts

const FEAR_GREED_URL = "https://api.alternative.me/fng/";
const CACHE_TTL = 60 * 60 * 1000; // 1시간

interface FearGreedData {
  value: number;
  classification: string;
  marketPhase: string;
  timestamp: string;
}

interface FearGreedHistoryItem {
  value: number;
  classification: string;
  timestamp: string;
}

// 간단한 인메모리 캐시
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (item && Date.now() < item.expiresAt) {
    return item.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttl: number = CACHE_TTL): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

/**
 * 마켓 페이즈 계산
 */
function calculateMarketPhase(value: number): string {
  if (value < 25) return "accumulate"; // 극도의 공포 = 매수 기회
  if (value < 50) return "hold";
  if (value < 75) return "reduce";
  return "exit"; // 극도의 탐욕 = 익절
}

/**
 * Fear & Greed Index 조회
 */
export async function getFearGreedIndex(): Promise<FearGreedData> {
  const key = "fear-greed:current";
  const cached = getCached<FearGreedData>(key);
  if (cached) return cached;

  const res = await fetch(`${FEAR_GREED_URL}?limit=1`);
  if (!res.ok) {
    throw new Error(`Fear & Greed API error: ${res.status}`);
  }

  const data = await res.json();
  const item = data.data[0];

  const value = parseInt(item.value);
  const result: FearGreedData = {
    value,
    classification: item.value_classification,
    marketPhase: calculateMarketPhase(value),
    timestamp: new Date(parseInt(item.timestamp) * 1000).toISOString(),
  };

  setCache(key, result);
  return result;
}

/**
 * Fear & Greed 히스토리 조회
 */
export async function getFearGreedHistory(
  days: number = 30
): Promise<FearGreedHistoryItem[]> {
  const key = `fear-greed:history:${days}`;
  const cached = getCached<FearGreedHistoryItem[]>(key);
  if (cached) return cached;

  const res = await fetch(`${FEAR_GREED_URL}?limit=${days}`);
  if (!res.ok) {
    throw new Error(`Fear & Greed API error: ${res.status}`);
  }

  const data = await res.json();
  const result: FearGreedHistoryItem[] = data.data.map((item: any) => ({
    value: parseInt(item.value),
    classification: item.value_classification,
    timestamp: new Date(parseInt(item.timestamp) * 1000).toISOString(),
  }));

  setCache(key, result);
  return result;
}
