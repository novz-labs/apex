// src/modules/external/defillama.service.ts

const BASE_URL = "https://api.llama.fi";
const YIELDS_URL = "https://yields.llama.fi";
const CACHE_TTL = 5 * 60 * 1000; // 5분

interface ProtocolTVL {
  tvl: number;
  change_1d: number;
  change_7d: number;
}

interface Protocol {
  name: string;
  tvl: number;
  chainTvls: Record<string, number>;
  change_1d?: number;
  change_7d?: number;
}

interface YieldPool {
  pool: string;
  project: string;
  chain: string;
  apy: number;
  tvlUsd: number;
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
 * 프로토콜 TVL 조회
 */
export async function getProtocolTVL(protocol: string): Promise<ProtocolTVL> {
  const key = `tvl:${protocol}`;
  const cached = getCached<ProtocolTVL>(key);
  if (cached) return cached;

  const url = `${BASE_URL}/protocol/${protocol}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DeFiLlama API error: ${res.status}`);
  }

  const data = await res.json();

  // TVL이 배열인 경우 마지막 값 사용
  let currentTvl = 0;
  if (Array.isArray(data.tvl)) {
    const lastTvl = data.tvl[data.tvl.length - 1];
    currentTvl = lastTvl?.totalLiquidityUSD || 0;
  } else if (typeof data.tvl === "number") {
    currentTvl = data.tvl;
  } else if (data.currentChainTvls) {
    currentTvl = Object.values(
      data.currentChainTvls as Record<string, number>
    ).reduce((a, b) => a + b, 0);
  }

  const result: ProtocolTVL = {
    tvl: currentTvl,
    change_1d: data.change_1d || 0,
    change_7d: data.change_7d || 0,
  };

  setCache(key, result);
  return result;
}

/**
 * 전체 프로토콜 목록 조회
 */
export async function getAllProtocols(): Promise<Protocol[]> {
  const key = "protocols:all";
  const cached = getCached<Protocol[]>(key);
  if (cached) return cached;

  const url = `${BASE_URL}/protocols`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DeFiLlama API error: ${res.status}`);
  }

  const data = await res.json();
  const result: Protocol[] = data.slice(0, 100).map((p: any) => ({
    name: p.name,
    tvl: p.tvl || 0,
    chainTvls: p.chainTvls || {},
    change_1d: p.change_1d,
    change_7d: p.change_7d,
  }));

  setCache(key, result);
  return result;
}

/**
 * Yield Pool 목록 조회
 */
export async function getYieldPools(limit: number = 50): Promise<YieldPool[]> {
  const key = `yields:${limit}`;
  const cached = getCached<YieldPool[]>(key);
  if (cached) return cached;

  const url = `${YIELDS_URL}/pools`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DeFiLlama Yields API error: ${res.status}`);
  }

  const data = await res.json();
  const pools = data.data || [];

  // APY 기준 정렬 후 상위 N개
  const result: YieldPool[] = pools
    .filter((p: any) => p.apy && p.tvlUsd > 100000)
    .sort((a: any, b: any) => b.apy - a.apy)
    .slice(0, limit)
    .map((p: any) => ({
      pool: p.pool,
      project: p.project,
      chain: p.chain,
      apy: p.apy || 0,
      tvlUsd: p.tvlUsd || 0,
    }));

  setCache(key, result);
  return result;
}
