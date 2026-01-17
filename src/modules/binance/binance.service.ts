// src/modules/exchange/binance.service.ts
import {
  getNetworkInfo as getClientNetworkInfo,
  privateRequest,
  publicRequest,
  spotPrivateRequest,
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

// ============================================
// 지갑 조회 및 이체
// ============================================

/**
 * Spot 지갑 잔고 조회
 */
export async function getSpotBalance(asset: string = "USDT") {
  const data = await spotPrivateRequest<{
    balances: Array<{
      asset: string;
      free: string;
      locked: string;
    }>;
  }>("GET", "/api/v3/account");

  const balance = data.balances.find((b) => b.asset === asset);

  return {
    asset,
    free: balance ? parseFloat(balance.free) : 0,
    locked: balance ? parseFloat(balance.locked) : 0,
    total: balance ? parseFloat(balance.free) + parseFloat(balance.locked) : 0,
  };
}

/**
 * 모든 지갑 잔고 조회 (Spot, Futures, Earn 등)
 */
export async function getAllBalances(asset: string = "USDT") {
  const [spot, futures] = await Promise.all([
    getSpotBalance(asset),
    getAccountInfo(),
  ]);

  const futuresBalance = futures.assets.find((a) => a.asset === asset);

  return {
    asset,
    spot: spot.free,
    futures: futuresBalance ? parseFloat(futuresBalance.availableBalance) : 0,
    total:
      spot.free +
      (futuresBalance ? parseFloat(futuresBalance.availableBalance) : 0),
  };
}

/**
 * 지갑 간 자금 이체
 *
 * Transfer Types:
 * - MAIN_UMFUTURE: Spot → USDT-M Futures
 * - UMFUTURE_MAIN: USDT-M Futures → Spot
 * - MAIN_CMFUTURE: Spot → COIN-M Futures
 * - CMFUTURE_MAIN: COIN-M Futures → Spot
 * - MAIN_MARGIN: Spot → Margin (Cross)
 * - MARGIN_MAIN: Margin (Cross) → Spot
 */
export async function internalTransfer(params: {
  asset: string;
  amount: number;
  type:
    | "MAIN_UMFUTURE"
    | "UMFUTURE_MAIN"
    | "MAIN_CMFUTURE"
    | "CMFUTURE_MAIN"
    | "MAIN_MARGIN"
    | "MARGIN_MAIN";
}) {
  const { asset, amount, type } = params;

  console.log(`💸 [Binance] Transfer: ${amount} ${asset} (${type})`);

  const result = await spotPrivateRequest<{ tranId: number }>(
    "POST",
    "/sapi/v1/asset/transfer",
    {
      asset,
      amount: amount.toString(),
      type,
    }
  );

  return {
    success: true,
    tranId: result.tranId,
    asset,
    amount,
    type,
  };
}

/**
 * Spot → USDT-M Futures 이체 (단축)
 */
export async function transferToFutures(asset: string, amount: number) {
  return internalTransfer({
    asset,
    amount,
    type: "MAIN_UMFUTURE",
  });
}

/**
 * USDT-M Futures → Spot 이체 (단축)
 */
export async function transferToSpot(asset: string, amount: number) {
  return internalTransfer({
    asset,
    amount,
    type: "UMFUTURE_MAIN",
  });
}

// ============================================
// Earn (Flexible Savings)
// ============================================

/**
 * Flexible Earn 잔고 조회
 */
export async function getFlexibleEarnBalance(asset: string = "USDT") {
  try {
    const data = await spotPrivateRequest<{
      rows: Array<{
        asset: string;
        freeAmount: string;
        totalAmount: string;
        lockedAmount: string;
      }>;
    }>("GET", "/sapi/v1/simple-earn/flexible/position", {
      asset,
    });

    const position = data.rows.find((r) => r.asset === asset);

    return {
      asset,
      freeAmount: position ? parseFloat(position.freeAmount) : 0,
      totalAmount: position ? parseFloat(position.totalAmount) : 0,
      lockedAmount: position ? parseFloat(position.lockedAmount) : 0,
    };
  } catch (error) {
    // Earn에 자산이 없는 경우
    return {
      asset,
      freeAmount: 0,
      totalAmount: 0,
      lockedAmount: 0,
    };
  }
}

/**
 * Flexible Earn에서 자금 상환 (Spot으로 이동)
 */
export async function redeemFlexibleEarn(params: {
  productId: string;
  amount?: number; // 없으면 전액 상환
  redeemAll?: boolean;
}) {
  const { productId, amount, redeemAll } = params;

  console.log(
    `📤 [Binance] Redeem Flexible Earn: ${amount ?? "ALL"} (productId: ${productId})`
  );

  const requestParams: Record<string, unknown> = {
    productId,
  };

  if (redeemAll) {
    requestParams.redeemAll = true;
  } else if (amount) {
    requestParams.amount = amount.toString();
  }

  const result = await spotPrivateRequest<{
    redeemId: number;
    success: boolean;
  }>("POST", "/sapi/v1/simple-earn/flexible/redeem", requestParams);

  return {
    success: result.success,
    redeemId: result.redeemId,
  };
}

/**
 * Flexible Earn 상품 목록 조회
 */
export async function getFlexibleEarnProducts(asset?: string) {
  const params: Record<string, unknown> = {};
  if (asset) {
    params.asset = asset;
  }

  const data = await spotPrivateRequest<{
    rows: Array<{
      asset: string;
      productId: string;
      latestAnnualPercentageRate: string;
      canRedeem: boolean;
    }>;
  }>("GET", "/sapi/v1/simple-earn/flexible/list", params);

  return data.rows.map((r) => ({
    asset: r.asset,
    productId: r.productId,
    annualRate: parseFloat(r.latestAnnualPercentageRate) * 100, // %로 변환
    canRedeem: r.canRedeem,
  }));
}

/**
 * 종합: 모든 곳에서 자금 모아서 Futures로 이체
 */
export async function consolidateToFutures(
  asset: string = "USDT",
  minAmount: number = 10
): Promise<{
  fromSpot: number;
  fromEarn: number;
  total: number;
  success: boolean;
}> {
  let fromSpot = 0;
  let fromEarn = 0;

  // 1. Spot 잔고 확인 및 이체
  const spotBalance = await getSpotBalance(asset);
  if (spotBalance.free >= minAmount) {
    await transferToFutures(asset, spotBalance.free);
    fromSpot = spotBalance.free;
    console.log(`   ✅ Transferred ${fromSpot} ${asset} from Spot`);
  }

  // 2. Earn 잔고 확인 및 상환
  try {
    const earnBalance = await getFlexibleEarnBalance(asset);
    if (earnBalance.freeAmount >= minAmount) {
      const products = await getFlexibleEarnProducts(asset);
      const product = products.find((p) => p.asset === asset && p.canRedeem);

      if (product) {
        await redeemFlexibleEarn({
          productId: product.productId,
          redeemAll: true,
        });
        fromEarn = earnBalance.freeAmount;
        console.log(`   ✅ Redeemed ${fromEarn} ${asset} from Earn`);

        // Earn → Spot 이동 후 Futures로 이체 (약간의 딜레이 필요할 수 있음)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const newSpotBalance = await getSpotBalance(asset);
        if (newSpotBalance.free >= minAmount) {
          await transferToFutures(asset, newSpotBalance.free);
        }
      }
    }
  } catch (error) {
    console.warn(`   ⚠️ Earn redemption skipped: ${error}`);
  }

  return {
    fromSpot,
    fromEarn,
    total: fromSpot + fromEarn,
    success: true,
  };
}
