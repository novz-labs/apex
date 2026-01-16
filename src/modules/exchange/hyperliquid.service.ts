// src/modules/exchange/hyperliquid.service.ts
import {
  getExchangeClientFromEnv,
  getInfoClient,
  getNetworkInfo,
} from "./hyperliquid.client";

// ============================================
// Account & Position 조회
// ============================================

/**
 * 계정 상태 조회 (잔고, 마진, 미실현 PnL)
 */
export async function getAccountState(wallet: string) {
  const client = getInfoClient();
  const state = await client.clearinghouseState({
    user: wallet as `0x${string}`,
  });

  return {
    marginSummary: state.marginSummary,
    withdrawable: state.withdrawable,
    crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
  };
}

/**
 * 오픈 포지션 조회
 */
export async function getOpenPositions(wallet: string) {
  const client = getInfoClient();
  const state = await client.clearinghouseState({
    user: wallet as `0x${string}`,
  });

  // 포지션이 있는 자산만 필터링
  return state.assetPositions
    .filter((p) => parseFloat(p.position.szi) !== 0)
    .map((p) => ({
      coin: p.position.coin,
      szi: p.position.szi,
      entryPx: p.position.entryPx,
      positionValue: p.position.positionValue,
      unrealizedPnl: p.position.unrealizedPnl,
      returnOnEquity: p.position.returnOnEquity,
      leverage: p.position.leverage,
      liquidationPx: p.position.liquidationPx,
      marginUsed: p.position.marginUsed,
    }));
}

/**
 * 미체결 주문 조회
 */
export async function getOpenOrders(wallet: string) {
  const client = getInfoClient();
  const orders = await client.openOrders({ user: wallet as `0x${string}` });

  return orders.map((o) => ({
    coin: o.coin,
    oid: o.oid,
    side: o.side,
    limitPx: o.limitPx,
    sz: o.sz,
    origSz: o.origSz,
    timestamp: o.timestamp,
  }));
}

// ============================================
// 시장 데이터 조회
// ============================================

/**
 * 오더북(L2) 조회
 */
export async function getL2Book(coin: string) {
  const client = getInfoClient();
  return client.l2Book({ coin });
}

/**
 * 펀딩비 조회
 */
export async function getFundingRate(coin: string) {
  const client = getInfoClient();
  const meta = await client.metaAndAssetCtxs();

  // coin에 해당하는 asset 찾기
  const assetIndex = meta[0].universe.findIndex((a) => a.name === coin);
  if (assetIndex === -1) {
    throw new Error(`Coin not found: ${coin}`);
  }

  const assetCtx = meta[1][assetIndex];

  return {
    coin,
    fundingRate: assetCtx.funding,
    premium: assetCtx.premium || "0",
    nextFunding: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 다음 펀딩 시간
  };
}

/**
 * 전체 코인 메타데이터 조회
 */
export async function getMeta() {
  const client = getInfoClient();
  const meta = await client.meta();

  return {
    universe: meta.universe.map((u) => ({
      name: u.name,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
      onlyIsolated: u.onlyIsolated,
    })),
  };
}

// ============================================
// 거래 실행
// ============================================

/**
 * 코인 이름으로 asset index 조회
 */
async function getAssetIndex(coin: string): Promise<number> {
  const client = getInfoClient();
  const meta = await client.meta();
  const index = meta.universe.findIndex((a) => a.name === coin);

  if (index === -1) {
    throw new Error(`Coin not found: ${coin}`);
  }

  return index;
}

/**
 * 주문 실행
 */
export async function placeOrder(params: {
  coin: string;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly?: boolean;
  timeInForce?: "Gtc" | "Ioc" | "Alo";
  cloid?: string;
}) {
  const client = getExchangeClientFromEnv();
  const assetIndex = await getAssetIndex(params.coin);

  const result = await client.order({
    orders: [
      {
        a: assetIndex,
        b: params.isBuy,
        p: params.price,
        s: params.size,
        r: params.reduceOnly ?? false,
        t: {
          limit: {
            tif: params.timeInForce ?? "Gtc",
          },
        },
        c: params.cloid,
      },
    ],
    grouping: "na",
  });

  return result;
}

/**
 * 주문 취소
 */
export async function cancelOrder(params: { coin: string; oid: number }) {
  const client = getExchangeClientFromEnv();
  const assetIndex = await getAssetIndex(params.coin);

  const result = await client.cancel({
    cancels: [
      {
        a: assetIndex,
        o: params.oid,
      },
    ],
  });

  return result;
}

/**
 * 모든 주문 취소
 */
export async function cancelAllOrders(coin?: string) {
  const client = getExchangeClientFromEnv();
  const wallet = process.env.HYPERLIQUID_WALLET_ADDRESS as `0x${string}`;

  // 미체결 주문 조회
  const openOrders = await getOpenOrders(wallet);

  // coin이 지정된 경우 해당 코인만 필터링
  const ordersToCancel = coin
    ? openOrders.filter((o) => o.coin === coin)
    : openOrders;

  if (ordersToCancel.length === 0) {
    return { status: "ok", cancelled: 0 };
  }

  // 각 주문 취소
  const results = await Promise.all(
    ordersToCancel.map((o) => cancelOrder({ coin: o.coin, oid: o.oid }))
  );

  return {
    status: "ok",
    cancelled: results.length,
    results,
  };
}

// ============================================
// 유틸리티
// ============================================

/**
 * 네트워크 정보 반환
 */
export function getNetwork() {
  return getNetworkInfo();
}
