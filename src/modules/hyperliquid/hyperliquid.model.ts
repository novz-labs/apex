// src/modules/exchange/model.ts
import { t } from "elysia";

// ============================================
// 공통 타입
// ============================================
export const OrderSide = t.Union([t.Literal("buy"), t.Literal("sell")]);
export const OrderType = t.Union([
  t.Literal("limit"),
  t.Literal("market"),
  t.Literal("stop_limit"),
  t.Literal("stop_market"),
]);
export const TimeInForce = t.Union([
  t.Literal("Gtc"), // Good til Cancelled
  t.Literal("Ioc"), // Immediate or Cancel
  t.Literal("Alo"), // Add Liquidity Only
]);

// ============================================
// 계정 상태 스키마
// ============================================
export const AccountStateSchema = {
  // GET /exchange/account
  query: t.Object({
    wallet: t.Optional(t.String({ pattern: "^0x[a-fA-F0-9]{40}$" })),
  }),

  res: t.Object({
    marginSummary: t.Object({
      accountValue: t.String(),
      totalMarginUsed: t.String(),
      totalNtlPos: t.String(),
      totalRawUsd: t.String(),
    }),
    withdrawable: t.String(),
    crossMaintenanceMarginUsed: t.String(),
  }),
};

// ============================================
// 포지션 스키마
// ============================================
export const PositionSchema = {
  // GET /exchange/positions
  query: t.Object({
    wallet: t.Optional(t.String({ pattern: "^0x[a-fA-F0-9]{40}$" })),
  }),

  res: t.Array(
    t.Object({
      coin: t.String(),
      szi: t.String(), // position size (signed)
      entryPx: t.Union([t.String(), t.Null()]),
      positionValue: t.String(),
      unrealizedPnl: t.String(),
      returnOnEquity: t.String(),
      leverage: t.Object({
        type: t.String(),
        value: t.Number(),
        rawUsd: t.Optional(t.String()),
      }),
      liquidationPx: t.Union([t.String(), t.Null()]),
      marginUsed: t.String(),
    })
  ),
};

// ============================================
// 오더북 스키마
// ============================================
export const OrderBookSchema = {
  // GET /exchange/orderbook/:coin
  params: t.Object({
    coin: t.String(),
  }),

  res: t.Union([
    t.Object({
      coin: t.String(),
      time: t.Number(),
      levels: t.Tuple([
        t.Array(
          t.Object({
            px: t.String(), // price
            sz: t.String(), // size
            n: t.Number(), // number of orders
          })
        ),
        t.Array(
          t.Object({
            px: t.String(),
            sz: t.String(),
            n: t.Number(),
          })
        ),
      ]),
    }),
    t.Null(),
  ]),
};

// ============================================
// 오픈 오더 스키마
// ============================================
export const OpenOrdersSchema = {
  // GET /exchange/orders
  query: t.Object({
    wallet: t.Optional(t.String({ pattern: "^0x[a-fA-F0-9]{40}$" })),
  }),

  res: t.Array(
    t.Object({
      coin: t.String(),
      oid: t.Number(),
      side: t.String(),
      limitPx: t.String(),
      sz: t.String(),
      origSz: t.String(),
      timestamp: t.Number(),
    })
  ),
};

// ============================================
// 주문 실행 스키마
// ============================================
export const PlaceOrderSchema = {
  // POST /exchange/order
  body: t.Object({
    coin: t.String(),
    isBuy: t.Boolean(),
    price: t.String(),
    size: t.String(),
    reduceOnly: t.Optional(t.Boolean()),
    timeInForce: t.Optional(TimeInForce),
    cloid: t.Optional(t.String()), // client order id
  }),

  res: t.Object({
    status: t.String(),
    response: t.Optional(
      t.Object({
        type: t.String(),
        data: t.Object({
          statuses: t.Array(t.Any()),
        }),
      })
    ),
  }),
};

// ============================================
// 주문 취소 스키마
// ============================================
export const CancelOrderSchema = {
  // POST /exchange/cancel
  body: t.Object({
    coin: t.String(),
    oid: t.Number(),
  }),

  res: t.Object({
    status: t.String(),
    response: t.Optional(
      t.Object({
        type: t.String(),
        data: t.Object({
          statuses: t.Array(t.String()),
        }),
      })
    ),
  }),
};

// ============================================
// 펀딩비 스키마
// ============================================
export const FundingRateSchema = {
  // GET /exchange/funding/:coin
  params: t.Object({
    coin: t.String(),
  }),

  res: t.Object({
    coin: t.String(),
    fundingRate: t.String(),
    premium: t.String(),
    nextFunding: t.String(),
  }),
};

// ============================================
// 메타데이터 스키마
// ============================================
export const MetaSchema = {
  // GET /exchange/meta
  res: t.Object({
    universe: t.Array(
      t.Object({
        name: t.String(),
        szDecimals: t.Number(),
        maxLeverage: t.Number(),
        onlyIsolated: t.Optional(t.Boolean()),
      })
    ),
  }),
};

// ============================================
// 네트워크 정보 스키마
// ============================================
export const NetworkInfoSchema = {
  // GET /exchange/network
  res: t.Object({
    isTestnet: t.Boolean(),
    httpUrl: t.String(),
    wsUrl: t.String(),
  }),
};
