// src/modules/exchange/binance.service.ts
import {
  getNetworkInfo as getClientNetworkInfo,
  privateRequest,
  publicRequest,
} from "./binance.client";

// ============================================
// 타입 정의
// ============================================

interface BinanceAccountInfo {
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  positions: Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unRealizedProfit: string;
    liquidationPrice: string;
    leverage: string;
    marginType: string;
    positionSide: string;
  }>;
  assets: Array<{
    asset: string;
    walletBalance: string;
    unrealizedProfit: string;
    marginBalance: string;
    availableBalance: string;
  }>;
}

interface BinancePosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  positionSide: string;
  notional: string;
}

interface BinanceOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  type: string;
  side: string;
  time: number;
  updateTime: number;
}

interface BinanceOrderBook {
  lastUpdateId: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

interface BinanceFundingRate {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
  markPrice: string;
}

interface BinanceExchangeInfo {
  symbols: Array<{
    symbol: string;
    pair: string;
    contractType: string;
    baseAsset: string;
    quoteAsset: string;
    pricePrecision: number;
    quantityPrecision: number;
    filters: Array<Record<string, unknown>>;
  }>;
}

// ============================================
// 계정 조회
// ============================================

/**
 * 계정 정보 조회 (잔고, 마진, 포지션)
 */
export async function getAccountInfo() {
  const data = await privateRequest<BinanceAccountInfo>(
    "GET",
    "/fapi/v2/account"
  );

  return {
    totalWalletBalance: data.totalWalletBalance,
    totalUnrealizedProfit: data.totalUnrealizedProfit,
    totalMarginBalance: data.totalMarginBalance,
    availableBalance: data.availableBalance,
    maxWithdrawAmount: data.maxWithdrawAmount,
    assets: data.assets
      .filter((a) => parseFloat(a.walletBalance) > 0)
      .map((a) => ({
        asset: a.asset,
        walletBalance: a.walletBalance,
        unrealizedProfit: a.unrealizedProfit,
        marginBalance: a.marginBalance,
        availableBalance: a.availableBalance,
      })),
  };
}

/**
 * 오픈 포지션 조회
 */
export async function getPositions() {
  const data = await privateRequest<BinancePosition[]>(
    "GET",
    "/fapi/v2/positionRisk"
  );

  // 포지션이 있는 심볼만 필터링
  return data
    .filter((p) => parseFloat(p.positionAmt) !== 0)
    .map((p) => ({
      symbol: p.symbol,
      positionAmt: p.positionAmt,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      unrealizedPnl: p.unRealizedProfit,
      liquidationPrice: p.liquidationPrice,
      leverage: p.leverage,
      marginType: p.marginType,
      positionSide: p.positionSide,
      notional: p.notional,
    }));
}

/**
 * 미체결 주문 조회
 */
export async function getOpenOrders(symbol?: string) {
  const params: Record<string, unknown> = {};
  if (symbol) {
    params.symbol = symbol;
  }

  const data = await privateRequest<BinanceOrder[]>(
    "GET",
    "/fapi/v1/openOrders",
    params
  );

  return data.map((o) => ({
    symbol: o.symbol,
    orderId: o.orderId,
    clientOrderId: o.clientOrderId,
    price: o.price,
    origQty: o.origQty,
    executedQty: o.executedQty,
    status: o.status,
    type: o.type,
    side: o.side,
    time: o.time,
  }));
}

// ============================================
// 시장 데이터
// ============================================

/**
 * 오더북 조회
 */
export async function getOrderBook(symbol: string, limit = 20) {
  const data = await publicRequest<BinanceOrderBook>("/fapi/v1/depth", {
    symbol,
    limit,
  });

  return {
    symbol,
    lastUpdateId: data.lastUpdateId,
    bids: data.bids.map(([price, qty]) => ({ price, quantity: qty })),
    asks: data.asks.map(([price, qty]) => ({ price, quantity: qty })),
  };
}

/**
 * 펀딩비 조회
 */
export async function getFundingRate(symbol: string) {
  const data = await publicRequest<BinanceFundingRate>(
    "/fapi/v1/premiumIndex",
    { symbol }
  );

  return {
    symbol: data.symbol,
    fundingRate: data.fundingRate,
    markPrice: data.markPrice,
    nextFundingTime: new Date(data.fundingTime).toISOString(),
  };
}

/**
 * 거래소 정보 (심볼 메타데이터)
 */
export async function getExchangeInfo() {
  const data = await publicRequest<BinanceExchangeInfo>(
    "/fapi/v1/exchangeInfo"
  );

  return {
    symbols: data.symbols.map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision,
      contractType: s.contractType,
    })),
  };
}

/**
 * 심볼 가격 조회
 */
export async function getPrice(symbol: string) {
  const data = await publicRequest<{ symbol: string; price: string }>(
    "/fapi/v1/ticker/price",
    { symbol }
  );

  return {
    symbol: data.symbol,
    price: data.price,
  };
}

// ============================================
// 거래 실행
// ============================================

/**
 * 주문 실행
 */
export async function placeOrder(params: {
  symbol: string;
  side: "BUY" | "SELL";
  type:
    | "LIMIT"
    | "MARKET"
    | "STOP"
    | "STOP_MARKET"
    | "TAKE_PROFIT"
    | "TAKE_PROFIT_MARKET";
  quantity: string;
  price?: string;
  stopPrice?: string;
  timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
  reduceOnly?: boolean;
  newClientOrderId?: string;
}) {
  const orderParams: Record<string, unknown> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
  };

  if (params.price) orderParams.price = params.price;
  if (params.stopPrice) orderParams.stopPrice = params.stopPrice;
  if (params.timeInForce) orderParams.timeInForce = params.timeInForce;
  if (params.reduceOnly !== undefined)
    orderParams.reduceOnly = params.reduceOnly.toString();
  if (params.newClientOrderId)
    orderParams.newClientOrderId = params.newClientOrderId;

  // LIMIT 주문인 경우 timeInForce 필수
  if (params.type === "LIMIT" && !params.timeInForce) {
    orderParams.timeInForce = "GTC";
  }

  const result = await privateRequest<BinanceOrder>(
    "POST",
    "/fapi/v1/order",
    orderParams
  );

  return {
    orderId: result.orderId,
    clientOrderId: result.clientOrderId,
    symbol: result.symbol,
    side: result.side,
    type: result.type,
    price: result.price,
    origQty: result.origQty,
    status: result.status,
  };
}

/**
 * 주문 취소
 */
export async function cancelOrder(params: {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
}) {
  const cancelParams: Record<string, unknown> = {
    symbol: params.symbol,
  };

  if (params.orderId) cancelParams.orderId = params.orderId;
  if (params.origClientOrderId)
    cancelParams.origClientOrderId = params.origClientOrderId;

  const result = await privateRequest<BinanceOrder>(
    "DELETE",
    "/fapi/v1/order",
    cancelParams
  );

  return {
    orderId: result.orderId,
    clientOrderId: result.clientOrderId,
    symbol: result.symbol,
    status: result.status,
  };
}

/**
 * 모든 미체결 주문 취소
 */
export async function cancelAllOrders(symbol: string) {
  const result = await privateRequest<{ code: number; msg: string }>(
    "DELETE",
    "/fapi/v1/allOpenOrders",
    { symbol }
  );

  return {
    status: "ok",
    result,
  };
}

// ============================================
// 유틸리티
// ============================================

/**
 * 네트워크 정보 반환
 */
export function getNetwork() {
  return getClientNetworkInfo();
}
