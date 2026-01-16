// src/api/routes/exchange.ts
import { Elysia } from "elysia";
import {
  cancelOrder,
  getAccountState,
  getFundingRate,
  getL2Book,
  getMeta,
  getNetwork,
  getOpenOrders,
  getOpenPositions,
  placeOrder,
} from "../../modules/exchange/hyperliquid.service";
import {
  AccountStateSchema,
  CancelOrderSchema,
  FundingRateSchema,
  MetaSchema,
  NetworkInfoSchema,
  OpenOrdersSchema,
  OrderBookSchema,
  PlaceOrderSchema,
  PositionSchema,
} from "../../modules/exchange/model";

const DEFAULT_WALLET = process.env.HYPERLIQUID_WALLET_ADDRESS;

export const exchangeRoutes = new Elysia({ prefix: "/exchange" })
  // ============================================
  // 네트워크 정보
  // ============================================
  .get(
    "/network",
    () => {
      return getNetwork();
    },
    {
      response: NetworkInfoSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "네트워크 정보 조회",
        description: "현재 연결된 Hyperliquid 네트워크 정보 (Testnet/Mainnet)",
      },
    }
  )

  // ============================================
  // 계정 정보
  // ============================================
  .get(
    "/account",
    async ({ query }) => {
      const wallet = query.wallet || DEFAULT_WALLET;
      if (!wallet) {
        throw new Error("Wallet address required");
      }
      return getAccountState(wallet);
    },
    {
      query: AccountStateSchema.query,
      response: AccountStateSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "계정 상태 조회",
        description: "잔고, 마진, 미실현 PnL 등 계정 상태 조회",
      },
    }
  )

  .get(
    "/positions",
    async ({ query }) => {
      const wallet = query.wallet || DEFAULT_WALLET;
      if (!wallet) {
        throw new Error("Wallet address required");
      }
      return getOpenPositions(wallet);
    },
    {
      query: PositionSchema.query,
      response: PositionSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "오픈 포지션 조회",
        description: "현재 열린 포지션 목록 조회",
      },
    }
  )

  .get(
    "/orders",
    async ({ query }) => {
      const wallet = query.wallet || DEFAULT_WALLET;
      if (!wallet) {
        throw new Error("Wallet address required");
      }
      return getOpenOrders(wallet);
    },
    {
      query: OpenOrdersSchema.query,
      response: OpenOrdersSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "미체결 주문 조회",
        description: "현재 대기 중인 주문 목록 조회",
      },
    }
  )

  // ============================================
  // 시장 데이터
  // ============================================
  .get(
    "/orderbook/:coin",
    async ({ params }) => {
      return getL2Book(params.coin);
    },
    {
      params: OrderBookSchema.params,
      response: OrderBookSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "오더북 조회",
        description: "특정 코인의 L2 오더북 조회",
      },
    }
  )

  .get(
    "/funding/:coin",
    async ({ params }) => {
      return getFundingRate(params.coin);
    },
    {
      params: FundingRateSchema.params,
      response: FundingRateSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "펀딩비 조회",
        description: "특정 코인의 현재 펀딩비 조회",
      },
    }
  )

  .get(
    "/meta",
    async () => {
      return getMeta();
    },
    {
      response: MetaSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "메타데이터 조회",
        description: "전체 코인 목록 및 거래 설정 조회",
      },
    }
  )

  // ============================================
  // 거래 실행
  // ============================================
  .post(
    "/order",
    async ({ body }) => {
      return placeOrder({
        coin: body.coin,
        isBuy: body.isBuy,
        price: body.price,
        size: body.size,
        reduceOnly: body.reduceOnly,
        timeInForce: body.timeInForce,
        cloid: body.cloid,
      });
    },
    {
      body: PlaceOrderSchema.body,
      response: PlaceOrderSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "주문 실행",
        description: "지정가 주문 실행",
      },
    }
  )

  .post(
    "/cancel",
    async ({ body }) => {
      return cancelOrder({
        coin: body.coin,
        oid: body.oid,
      });
    },
    {
      body: CancelOrderSchema.body,
      response: CancelOrderSchema.res,
      detail: {
        tags: ["Exchange"],
        summary: "주문 취소",
        description: "특정 주문 취소",
      },
    }
  );
