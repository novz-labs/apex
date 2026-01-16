// src/modules/external/coingecko.service.ts

const BASE_URL = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 60 * 1000; // 1분

interface CoinPrice {
  usd: number;
  usd_market_cap: number;
  usd_24h_vol: number;
  usd_24h_change: number;
}

interface CoinDetails {
  fdv: number;
  marketCap: number;
  circulatingSupply: number;
  totalSupply: number;
}

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
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

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * 여러 코인의 가격 조회
 */
export async function getPrices(
  coinIds: string[]
): Promise<Record<string, CoinPrice>> {
  const key = `prices:${coinIds.sort().join(",")}`;
  const cached = getCached<Record<string, CoinPrice>>(key);
  if (cached) return cached;

  const url = `${BASE_URL}/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  const data = await res.json();
  setCache(key, data);
  return data;
}

/**
 * 코인 상세 정보 조회
 */
export async function getCoinDetails(coinId: string): Promise<CoinDetails> {
  const key = `details:${coinId}`;
  const cached = getCached<CoinDetails>(key);
  if (cached) return cached;

  const url = `${BASE_URL}/coins/${coinId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  const data = await res.json();
  const result: CoinDetails = {
    fdv: data.market_data?.fully_diluted_valuation?.usd || 0,
    marketCap: data.market_data?.market_cap?.usd || 0,
    circulatingSupply: data.market_data?.circulating_supply || 0,
    totalSupply: data.market_data?.total_supply || 0,
  };

  setCache(key, result);
  return result;
}

/**
 * 시장 목록 조회
 */
export async function getMarkets(limit: number = 100): Promise<MarketCoin[]> {
  const key = `markets:${limit}`;
  const cached = getCached<MarketCoin[]>(key);
  if (cached) return cached;

  const url = `${BASE_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  const data = await res.json();
  const result: MarketCoin[] = data.map((coin: any) => ({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    current_price: coin.current_price || 0,
    market_cap: coin.market_cap || 0,
    market_cap_rank: coin.market_cap_rank || 0,
    price_change_percentage_24h: coin.price_change_percentage_24h || 0,
  }));

  setCache(key, result);
  return result;
}
