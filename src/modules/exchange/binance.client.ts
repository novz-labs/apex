// src/modules/exchange/binance.client.ts
import { createHmac } from "crypto";

// ============================================
// 환경 설정
// ============================================
const isTestnet = process.env.BINANCE_TESTNET === "true";

const BASE_URL = isTestnet
  ? "https://testnet.binancefuture.com"
  : "https://fapi.binance.com";

const WS_URL = isTestnet
  ? "wss://fstream.binancefuture.com"
  : "wss://fstream.binance.com";

// ============================================
// HMAC-SHA256 서명 생성
// ============================================

/**
 * 서버 시간과의 차이 (ms)
 */
let serverTimeOffset = 0;

/**
 * 현재 타임스탬프 반환 (서버 시간 보정 적용)
 */
function getTimestamp(): number {
  return Date.now() + serverTimeOffset;
}

/**
 * HMAC-SHA256 서명 생성
 */
function createSignature(queryString: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(queryString).digest("hex");
}

/**
 * 쿼리 파라미터 → 쿼리 스트링 변환
 */
function buildQueryString(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

// ============================================
// API 요청 함수
// ============================================

/**
 * Public API 요청 (서명 불필요)
 */
export async function publicRequest<T>(
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const queryString = buildQueryString(params);
  const url = queryString
    ? `${BASE_URL}${endpoint}?${queryString}`
    : `${BASE_URL}${endpoint}`;

  const res = await fetch(url);

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Binance API Error: ${res.status} - ${error}`);
  }

  return res.json();
}

/**
 * Private API 요청 (HMAC-SHA256 서명 필요)
 */
export async function privateRequest<T>(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const apiKey = process.env.BINANCE_API_KEY;
  const secretKey = process.env.BINANCE_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error("BINANCE_API_KEY and BINANCE_SECRET_KEY are required");
  }

  // timestamp 추가
  const paramsWithTimestamp = {
    ...params,
    timestamp: getTimestamp(),
  };

  const queryString = buildQueryString(paramsWithTimestamp);
  const signature = createSignature(queryString, secretKey);
  const signedQueryString = `${queryString}&signature=${signature}`;

  const url =
    method === "GET"
      ? `${BASE_URL}${endpoint}?${signedQueryString}`
      : `${BASE_URL}${endpoint}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": apiKey,
      ...(method !== "GET" && {
        "Content-Type": "application/x-www-form-urlencoded",
      }),
    },
    ...(method !== "GET" && { body: signedQueryString }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Binance API Error: ${res.status} - ${error}`);
  }

  return res.json();
}

// ============================================
// 서버 시간 동기화
// ============================================

/**
 * Binance 서버 시간과 동기화
 */
export async function syncServerTime(): Promise<void> {
  const data = await publicRequest<{ serverTime: number }>("/fapi/v1/time");
  serverTimeOffset = data.serverTime - Date.now();
  console.log(`⏰ Binance server time synced. Offset: ${serverTimeOffset}ms`);
}

// ============================================
// 네트워크 정보
// ============================================

/**
 * 네트워크 정보 반환
 */
export function getNetworkInfo() {
  return {
    isTestnet,
    baseUrl: BASE_URL,
    wsUrl: WS_URL,
  };
}
