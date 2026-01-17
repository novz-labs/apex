// src/api/routes/binance.ts
import { Elysia } from "elysia";
import {
  BinanceAccountSchema,
  BinanceCancelAllOrdersSchema,
  BinanceCancelOrderSchema,
  BinanceExchangeInfoSchema,
  BinanceFundingRateSchema,
  BinanceNetworkInfoSchema,
  BinanceOpenOrdersSchema,
  BinanceOrderBookSchema,
  BinancePlaceOrderSchema,
  BinancePositionSchema,
  BinancePriceSchema,
  cancelAllOrders,
  cancelOrder,
  getAccountInfo,
  getExchangeInfo,
  getFundingRate,
  getNetwork,
  getOpenOrders,
  getOrderBook,
  getPositions,
  getPrice,
  placeOrder,
} from "../../modules/binance";

export const binanceRoutes = new Elysia({ prefix: "/binance" })
  // ============================================
  // 네트워크 정보
  // ============================================
  .get(
    "/network",
    () => {
      return getNetwork();
    },
    {
      response: BinanceNetworkInfoSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "네트워크 정보 조회",
        description:
          "현재 연결된 Binance Futures 네트워크 정보 (Testnet/Mainnet)",
      },
    }
  )

  // ============================================
  // 거래소 정보 (Public)
  // ============================================
  .get(
    "/info",
    async () => {
      return getExchangeInfo();
    },
    {
      response: BinanceExchangeInfoSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "거래소 정보 조회",
        description: "심볼 목록 및 거래 설정 조회 (Public API)",
      },
    }
  )

  .get(
    "/orderbook/:symbol",
    async ({ params, query }) => {
      return getOrderBook(params.symbol, query.limit);
    },
    {
      params: BinanceOrderBookSchema.params,
      query: BinanceOrderBookSchema.query,
      response: BinanceOrderBookSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "오더북 조회",
        description: "특정 심볼의 L2 오더북 조회 (Public API)",
      },
    }
  )

  .get(
    "/funding/:symbol",
    async ({ params }) => {
      return getFundingRate(params.symbol);
    },
    {
      params: BinanceFundingRateSchema.params,
      response: BinanceFundingRateSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "펀딩비 조회",
        description: "특정 심볼의 현재 펀딩비 조회 (Public API)",
      },
    }
  )

  .get(
    "/price/:symbol",
    async ({ params }) => {
      return getPrice(params.symbol);
    },
    {
      params: BinancePriceSchema.params,
      response: BinancePriceSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "현재가 조회",
        description: "특정 심볼의 현재 가격 조회 (Public API)",
      },
    }
  )

  // ============================================
  // 계정 정보 (Private)
  // ============================================
  .get(
    "/account",
    async () => {
      return getAccountInfo();
    },
    {
      response: BinanceAccountSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "계정 정보 조회",
        description: "잔고, 마진, 자산 정보 조회 (API 키 필요)",
      },
    }
  )

  .get(
    "/positions",
    async () => {
      return getPositions();
    },
    {
      response: BinancePositionSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "오픈 포지션 조회",
        description: "현재 열린 포지션 목록 조회 (API 키 필요)",
      },
    }
  )

  .get(
    "/orders",
    async ({ query }) => {
      return getOpenOrders(query.symbol);
    },
    {
      query: BinanceOpenOrdersSchema.query,
      response: BinanceOpenOrdersSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "미체결 주문 조회",
        description: "대기 중인 주문 목록 조회 (API 키 필요)",
      },
    }
  )

  // ============================================
  // 거래 실행 (Private)
  // ============================================
  .post(
    "/order",
    async ({ body }) => {
      return placeOrder({
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        quantity: body.quantity,
        price: body.price,
        stopPrice: body.stopPrice,
        timeInForce: body.timeInForce,
        reduceOnly: body.reduceOnly,
        newClientOrderId: body.newClientOrderId,
      });
    },
    {
      body: BinancePlaceOrderSchema.body,
      response: BinancePlaceOrderSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "주문 실행",
        description: "LIMIT/MARKET 주문 실행 (API 키 필요)",
      },
    }
  )

  .post(
    "/cancel",
    async ({ body }) => {
      return cancelOrder({
        symbol: body.symbol,
        orderId: body.orderId,
        origClientOrderId: body.origClientOrderId,
      });
    },
    {
      body: BinanceCancelOrderSchema.body,
      response: BinanceCancelOrderSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "주문 취소",
        description: "특정 주문 취소 (API 키 필요)",
      },
    }
  )

  .delete(
    "/orders/:symbol",
    async ({ params }) => {
      return cancelAllOrders(params.symbol);
    },
    {
      params: BinanceCancelAllOrdersSchema.params,
      response: BinanceCancelAllOrdersSchema.res,
      detail: {
        tags: ["Binance"],
        summary: "전체 주문 취소",
        description: "특정 심볼의 모든 미체결 주문 취소 (API 키 필요)",
      },
    }
  );
