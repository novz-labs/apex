// src/modules/exchange/binance.model.ts
import { t } from "elysia";

// ============================================
// Binance 계정 정보 스키마
// ============================================
export const BinanceAccountSchema = {
  // GET /binance/account
  res: t.Object({
    totalWalletBalance: t.String(),
    totalUnrealizedProfit: t.String(),
    totalMarginBalance: t.String(),
    availableBalance: t.String(),
    maxWithdrawAmount: t.String(),
    assets: t.Array(
      t.Object({
        asset: t.String(),
        walletBalance: t.String(),
        unrealizedProfit: t.String(),
        marginBalance: t.String(),
        availableBalance: t.String(),
      })
    ),
  }),
};

// ============================================
// Binance 포지션 스키마
// ============================================
export const BinancePositionSchema = {
  // GET /binance/positions
  res: t.Array(
    t.Object({
      symbol: t.String(),
      positionAmt: t.String(),
      entryPrice: t.String(),
      markPrice: t.String(),
      unrealizedPnl: t.String(),
      liquidationPrice: t.String(),
      leverage: t.String(),
      marginType: t.String(),
      positionSide: t.String(),
      notional: t.String(),
    })
  ),
};

// ============================================
// Binance 미체결 주문 스키마
// ============================================
export const BinanceOpenOrdersSchema = {
  // GET /binance/orders
  query: t.Object({
    symbol: t.Optional(t.String()),
  }),

  res: t.Array(
    t.Object({
      symbol: t.String(),
      orderId: t.Number(),
      clientOrderId: t.String(),
      price: t.String(),
      origQty: t.String(),
      executedQty: t.String(),
      status: t.String(),
      type: t.String(),
      side: t.String(),
      time: t.Number(),
    })
  ),
};

// ============================================
// Binance 오더북 스키마
// ============================================
export const BinanceOrderBookSchema = {
  // GET /binance/orderbook/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  query: t.Object({
    limit: t.Optional(t.Numeric({ default: 20 })),
  }),

  res: t.Object({
    symbol: t.String(),
    lastUpdateId: t.Number(),
    bids: t.Array(
      t.Object({
        price: t.String(),
        quantity: t.String(),
      })
    ),
    asks: t.Array(
      t.Object({
        price: t.String(),
        quantity: t.String(),
      })
    ),
  }),
};

// ============================================
// Binance 펀딩비 스키마
// ============================================
export const BinanceFundingRateSchema = {
  // GET /binance/funding/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  res: t.Object({
    symbol: t.String(),
    fundingRate: t.String(),
    markPrice: t.String(),
    nextFundingTime: t.String(),
  }),
};

// ============================================
// Binance 거래소 정보 스키마
// ============================================
export const BinanceExchangeInfoSchema = {
  // GET /binance/info
  res: t.Object({
    symbols: t.Array(
      t.Object({
        symbol: t.String(),
        baseAsset: t.String(),
        quoteAsset: t.String(),
        pricePrecision: t.Number(),
        quantityPrecision: t.Number(),
        contractType: t.String(),
      })
    ),
  }),
};

// ============================================
// Binance 가격 스키마
// ============================================
export const BinancePriceSchema = {
  // GET /binance/price/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  res: t.Object({
    symbol: t.String(),
    price: t.String(),
  }),
};

// ============================================
// Binance 주문 실행 스키마
// ============================================
export const BinancePlaceOrderSchema = {
  // POST /binance/order
  body: t.Object({
    symbol: t.String(),
    side: t.Union([t.Literal("BUY"), t.Literal("SELL")]),
    type: t.Union([
      t.Literal("LIMIT"),
      t.Literal("MARKET"),
      t.Literal("STOP"),
      t.Literal("STOP_MARKET"),
      t.Literal("TAKE_PROFIT"),
      t.Literal("TAKE_PROFIT_MARKET"),
    ]),
    quantity: t.String(),
    price: t.Optional(t.String()),
    stopPrice: t.Optional(t.String()),
    timeInForce: t.Optional(
      t.Union([
        t.Literal("GTC"),
        t.Literal("IOC"),
        t.Literal("FOK"),
        t.Literal("GTX"),
      ])
    ),
    reduceOnly: t.Optional(t.Boolean()),
    newClientOrderId: t.Optional(t.String()),
  }),

  res: t.Object({
    orderId: t.Number(),
    clientOrderId: t.String(),
    symbol: t.String(),
    side: t.String(),
    type: t.String(),
    price: t.String(),
    origQty: t.String(),
    status: t.String(),
  }),
};

// ============================================
// Binance 주문 취소 스키마
// ============================================
export const BinanceCancelOrderSchema = {
  // POST /binance/cancel
  body: t.Object({
    symbol: t.String(),
    orderId: t.Optional(t.Number()),
    origClientOrderId: t.Optional(t.String()),
  }),

  res: t.Object({
    orderId: t.Number(),
    clientOrderId: t.String(),
    symbol: t.String(),
    status: t.String(),
  }),
};

// ============================================
// Binance 전체 주문 취소 스키마
// ============================================
export const BinanceCancelAllOrdersSchema = {
  // DELETE /binance/orders/:symbol
  params: t.Object({
    symbol: t.String(),
  }),

  res: t.Object({
    status: t.String(),
    result: t.Object({
      code: t.Number(),
      msg: t.String(),
    }),
  }),
};

// ============================================
// Binance 네트워크 정보 스키마
// ============================================
export const BinanceNetworkInfoSchema = {
  // GET /binance/network
  res: t.Object({
    isTestnet: t.Boolean(),
    baseUrl: t.String(),
    wsUrl: t.String(),
  }),
};
