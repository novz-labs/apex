# Apex Trading Bot - Public API Specification (Enhanced)

This document provides a detailed technical specification for the public **GET** endpoints of the Apex Trading Bot. This is designed for LLM parsing and frontend developers building isolated dashboards in separate projects.

---

## 🔐 Security & Auth

- **GET Requests**: Publicly accessible. No `ADMIN_API_KEY` required by default.
- **POST/PUT/DELETE**: Protected by Auth Guard. Requires `Authorization: Bearer <ADMIN_API_KEY>` or `X-API-KEY: <ADMIN_API_KEY>`.
- **Global Prefix**: `/` (Default port: 4000)

---

## 📂 1. Portfolio & Performance (Core)

The most important endpoints for your dashboard.

### 1.1 Account & Snapshot Summary

`GET /jobs/account`

**Description**: Aggregate performance data from the local database.
**Response Body**:

```json
{
  "status": {
    "currentBalance": 1050.25,
    "peakBalance": 1100.0,
    "drawdown": 4.52,
    "totalPnl": 50.25,
    "totalPnlPercent": 5.025
  },
  "snapshots": [
    {
      "date": "2026-01-16",
      "balance": 1045.0,
      "dailyPnl": 5.0,
      "drawdown": 4.8
    }
  ],
  "performance": {
    "totalPnl": 50.25,
    "winRate": 0.62,
    "bestDay": { "date": "2026-01-10", "pnl": 25.0 }
  }
}
```

### 1.2 Multi-Exchange Asset Status

`GET /hyperliquid/account?wallet=0x...`
`GET /binance/account`

**Description**: Raw data directly from exchanges.

- **Fields**: Free balance, frozen margin, and account equity.

---

## 📂 2. Strategies & Operations

### 2.1 All Strategy Instances

`GET /strategy/`

**Description**: Lists all created strategies and whether they are active.
**Response**:

```json
{
  "strategies": [
    { "id": "cl...", "name": "Grid_BTC", "type": "grid_bot", "isRunning": true }
  ],
  "count": 1
}
```

### 2.2 Strategy Details & Stats

`GET /strategy/:id`

**Description**: Configuration + Performance data for a single bot.
**Response**:

```json
{
  "id": "string",
  "config": { "symbol": "BTC", "leverage": 3 },
  "stats": {
    "totalTrades": 45,
    "winRate": 64.2,
    "totalPnL": 120.5
  }
}
```

### 2.3 Optimization Agents

`GET /agent/` -> List all agents.
`GET /agent/:name` -> Details of a specific optimization agent (current round, best parameters found).

---

## 📂 3. Real-time Market & Signals

### 3.1 Market Sentiment History

`GET /jobs/sentiment`
**Description**: Internal sentiment trend (Fear & Greed index combined with market phase).

### 3.2 External Signals

- `GET /external/sentiment/fear-greed` -> Current Sentiment.
- `GET /external/trends/crypto` -> Search volume rankings.
- `GET /external/defillama/protocols` -> Major protocol TVLs.

### 3.3 Raw Exchange Data (Public)

- `GET /binance/price/:symbol` -> Live mark price.
- `GET /hyperliquid/funding/:coin` -> Current funding rate.

---

## 📂 4. Development & Setup Tools

### 4.1 AI Service Status

`GET /ai/status`

- **Output**: `{ "initialized": true, "lastAnalysisTime": "...", "minIntervalMinutes": 60 }`

### 4.2 Parameter Presets

`GET /backtest/presets/:strategyType`

- **Options**: `grid_bot`, `momentum`, `scalping`, `funding_arb`.
- **Description**: Returns recommended settings (from AI) for specific strategy types.

---

## 🏗 Schema Reference

| Field          | Meaning                                | Unit         |
| :------------- | :------------------------------------- | :----------- |
| `pnl`          | Profit and Loss                        | USD          |
| `drawdown`     | Peak-to-trough decline                 | % (Absolute) |
| `profitFactor` | Gross Profit / Gross Loss              | Ratio        |
| `sharpeRatio`  | Risk-adjusted return                   | Ratio        |
| `marketPhase`  | `accumulate`, `hold`, `reduce`, `exit` | Enum         |

> [!TIP]
> **대시보드 권장 연동**: `/jobs/account`로 전체 자산 현황을 그린 뒤, `/strategy/`를 호출하여 개별 봇들의 실시간 수익 분포를 확인하는 것이 가장 효율적입니다.
