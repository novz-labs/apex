// src/modules/exchange/index.ts

// Hyperliquid exports (primary exchange)
export * from "./hyperliquid.client";
export * from "./hyperliquid.service";
export * from "./model";

// Binance exports (secondary exchange - namespaced to avoid conflicts)
export * as BinanceClient from "./binance.client";
export * from "./binance.model";
export * as BinanceService from "./binance.service";
