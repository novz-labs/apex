import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import {
  binanceRoutes,
  exchangeRoutes,
  externalRoutes,
  initializeJobs,
  jobsRoutes,
  strategyRoutes,
} from "./api/routes";

const app = new Elysia()
  // Swagger UI - API 문서 및 테스트 인터페이스
  .use(
    swagger({
      documentation: {
        info: {
          title: "Apex Trading Bot API",
          version: "1.0.0",
          description: "AI 피드백 루프 기반 암호화폐 자동매매 봇 API",
        },
        tags: [
          { name: "Exchange", description: "Hyperliquid 거래소 연동 API" },
          { name: "Binance", description: "Binance Futures 거래소 연동 API" },
          {
            name: "External - CoinGecko",
            description: "CoinGecko 시장 데이터",
          },
          { name: "External - DeFiLlama", description: "DeFi TVL 데이터" },
          { name: "External - Sentiment", description: "Fear & Greed Index" },
          { name: "External - Trends", description: "Google Trends (옵션)" },
          { name: "Trade", description: "거래 관리 API" },
          { name: "Strategy", description: "전략 관리 API" },
          { name: "Jobs", description: "크론 작업 및 스케줄러 API" },
          { name: "AI", description: "AI 분석 API" },
          { name: "Market", description: "시장 데이터 API" },
        ],
      },
      path: "/swagger",
    })
  )

  // Health check
  .get("/", () => ({ status: "ok", message: "Apex Trading Bot" }), {
    detail: {
      tags: ["Health"],
      summary: "서버 상태 확인",
    },
  })

  .get(
    "/health",
    () => ({ status: "ok", timestamp: new Date().toISOString() }),
    {
      detail: {
        tags: ["Health"],
        summary: "헬스 체크",
      },
    }
  )

  // Routes
  .use(exchangeRoutes)
  .use(binanceRoutes)
  .use(strategyRoutes)
  .use(jobsRoutes)
  .use(externalRoutes)

  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(`📚 Swagger UI: http://localhost:3000/swagger`);

// 스케줄러 시작
initializeJobs();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  process.exit(0);
});
