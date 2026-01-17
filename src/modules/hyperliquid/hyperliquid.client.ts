// src/modules/exchange/hyperliquid.client.ts
import {
  ExchangeClient,
  HttpTransport,
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from "@nktkas/hyperliquid";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

// ============================================
// 환경 설정
// ============================================
const isTestnet = process.env.HYPERLIQUID_TESTNET === "true";

const HTTP_URL = isTestnet
  ? "https://api.hyperliquid-testnet.xyz"
  : "https://api.hyperliquid.xyz";

const WS_URL = isTestnet
  ? "wss://api.hyperliquid-testnet.xyz/ws"
  : "wss://api.hyperliquid.xyz/ws";

// ============================================
// 클라이언트 팩토리
// ============================================

/**
 * 읽기 전용 클라이언트 생성
 * - 계정 상태, 오더북, 펀딩비 등 조회
 */
export function createInfoClient(): InfoClient {
  const transport = new HttpTransport({ apiUrl: HTTP_URL });
  return new InfoClient({ transport });
}

/**
 * 거래 실행 클라이언트 생성
 * - 주문 실행, 취소, 포지션 청산 등
 * @param privateKey - 0x로 시작하는 private key
 */
export function createExchangeClient(
  privateKey: `0x${string}`
): ExchangeClient {
  const transport = new HttpTransport({ apiUrl: HTTP_URL });
  const wallet: PrivateKeyAccount = privateKeyToAccount(privateKey);

  return new ExchangeClient({
    transport,
    wallet,
    isTestnet,
  });
}

/**
 * WebSocket 구독 클라이언트 생성
 * - 실시간 오더북, 체결, 포지션 업데이트
 */
export function createSubscriptionClient(): SubscriptionClient {
  const transport = new WebSocketTransport({ url: WS_URL });
  return new SubscriptionClient({ transport });
}

// ============================================
// 싱글톤 인스턴스
// ============================================
let infoClientInstance: InfoClient | null = null;
let subscriptionClientInstance: SubscriptionClient | null = null;

/**
 * 공유 InfoClient 인스턴스 반환
 */
export function getInfoClient(): InfoClient {
  if (!infoClientInstance) {
    infoClientInstance = createInfoClient();
  }
  return infoClientInstance;
}

/**
 * 공유 SubscriptionClient 인스턴스 반환
 */
export function getSubscriptionClient(): SubscriptionClient {
  if (!subscriptionClientInstance) {
    subscriptionClientInstance = createSubscriptionClient();
  }
  return subscriptionClientInstance;
}

/**
 * 환경변수에서 ExchangeClient 생성
 * @throws Private key가 없으면 에러
 */
export function getExchangeClientFromEnv(): ExchangeClient {
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    throw new Error("HYPERLIQUID_PRIVATE_KEY is required");
  }
  return createExchangeClient(privateKey);
}

// ============================================
// 유틸리티
// ============================================

/**
 * Testnet 여부 확인
 */
export function getNetworkInfo() {
  return {
    isTestnet,
    httpUrl: HTTP_URL,
    wsUrl: WS_URL,
  };
}
