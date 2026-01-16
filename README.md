# Apex Trading Bot

> AI 피드백 루프 기반 암호화폐 자동매매 봇

## 🎯 목표

- **수익 목표**: $1,000 → $10,000 (2026년 상반기)
- **기술 스택**: Bun, TypeScript, Elysia, Prisma, SQLite
- **거래소**: Hyperliquid (Primary), Binance Futures (Secondary)

---

## 🚀 시작하기

### 설치

```bash
# 의존성 설치
bun install

# 환경변수 설정
cp .env.example .env
# .env 파일 편집
```

### 실행

```bash
# 개발 서버
bun dev

# 프로덕션
bun run start
```

### Swagger UI

```
http://localhost:3000/swagger
```

---

## 🔧 환경변수

```env
# Hyperliquid
HYPERLIQUID_PRIVATE_KEY=0x...
HYPERLIQUID_TESTNET=true

# Binance Futures
BINANCE_API_KEY=your_api_key
BINANCE_SECRET_KEY=your_secret_key
BINANCE_TESTNET=true

# Telegram (선택)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# OpenAI
OPENAI_API_KEY=sk-...
```

---

## 📊 주요 기능

### 거래소 연동

| 거래소      | 용도        | API           |
| ----------- | ----------- | ------------- |
| Hyperliquid | 주 거래소   | `/exchange/*` |
| Binance     | 보조 거래소 | `/binance/*`  |

### 전략

| 전략     | 자본 비중 | 설명                       |
| -------- | --------- | -------------------------- |
| Grid Bot | 40%       | 횡보장 그리드 매매         |
| Momentum | 30%       | RSI/BB/MACD 기반 추세 추종 |

### Cron Jobs

| Job               | 주기       | 설명                  |
| ----------------- | ---------- | --------------------- |
| candle-collector  | 매 1분     | BTC/ETH/SOL 캔들 수집 |
| sentiment-updater | 매 시간    | Fear & Greed Index    |
| daily-snapshot    | 매일 00:00 | 계정 스냅샷           |

---

## 📡 API 엔드포인트

### Exchange (Hyperliquid)

```
GET  /exchange/network     # 네트워크 정보
GET  /exchange/account     # 계정 상태
GET  /exchange/positions   # 포지션 조회
POST /exchange/order       # 주문 실행
```

### Binance

```
GET  /binance/network          # 네트워크 정보
GET  /binance/price/:symbol    # 현재가
GET  /binance/orderbook/:symbol # 오더북
GET  /binance/account          # 계정 정보
POST /binance/order            # 주문 실행
```

### Strategy

```
GET  /strategy/                  # 전략 목록
POST /strategy/grid-bot          # Grid Bot 생성
POST /strategy/momentum          # Momentum 생성
GET  /strategy/:id               # 전략 상세
POST /strategy/:id/start         # 시작
POST /strategy/:id/stop          # 중지
POST /strategy/:id/price-update  # 가격 업데이트
DELETE /strategy/:id             # 삭제
```

### Jobs

```
GET  /jobs/status           # 스케줄러 상태
POST /jobs/run/:jobName     # 수동 실행
GET  /jobs/candles          # 캔들 데이터
GET  /jobs/sentiment        # 센티먼트
GET  /jobs/account          # 계정 상태
```

---

## 📁 프로젝트 구조

```
src/
├── api/routes/          # Elysia 라우트
├── jobs/                # Cron Jobs
├── modules/
│   ├── exchange/        # 거래소 SDK
│   ├── strategy/        # 전략 서비스
│   ├── websocket/       # 실시간 데이터
│   ├── backtest/        # 백테스팅
│   └── notification/    # 텔레그램 알림
└── index.ts             # 메인 서버
```

---

## 📚 문서

- [아키텍처](docs/architecture.md)
- [전략 설계](docs/external-data-and-stretegy.md)
- [Cron & 외부 서비스](docs/external-services-and-cron.md)

---

## 🧪 테스트

```bash
# API 테스트
curl http://localhost:3000/binance/price/BTCUSDT
# → {"symbol":"BTCUSDT","price":"95291.10"}

curl http://localhost:3000/jobs/status
# → {"isRunning":true,"jobCount":3,"jobs":[...]}

curl -X POST http://localhost:3000/strategy/grid-bot \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","upperPrice":100000,"lowerPrice":90000,"gridCount":10,"totalCapital":1000,"leverage":3,"stopLossPercent":5}'
```

---

## 📝 라이선스

MIT
