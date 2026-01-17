import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import {
  agentRoutes,
  aiRoutes,
  backtestRoutes,
  binanceRoutes,
  externalRoutes,
  hyperliquidRoutes,
  initializeJobs,
  jobsRoutes,
  strategyRoutes,
} from "./api/routes";
import { aiService } from "./modules/ai";

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
          { name: "Backtest", description: "백테스트 및 시뮬레이션 API" },
          { name: "Agent", description: "자율 트레이딩 에이전트 API" },
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
  .use(hyperliquidRoutes)
  .use(binanceRoutes)
  .use(strategyRoutes)
  .use(backtestRoutes)
  .use(agentRoutes)
  .use(jobsRoutes)
  .use(aiRoutes)
  .use(externalRoutes)

  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(`📚 Swagger UI: http://localhost:3000/swagger`);

// 스케줄러 시작
initializeJobs();

// 전략 로드
import { strategyService } from "@strategy/strategy.service";
await strategyService.loadStrategies();

// 프리셋 시드 (기본 권장 설정)
import { presetService } from "./modules/strategy/preset.service";
await presetService.seedDefaultPresets();

// AI 서비스 초기화
aiService.initialize();

// API 키 검증
import {
  checkLiveModeRequirements,
  validateAllApiKeys,
} from "./modules/config/api-validator";
const liveCheck = await checkLiveModeRequirements();
if (!liveCheck.canGoLive && process.env.PAPER_MODE === "false") {
  console.error("❌ Live mode requirements not met:");
  liveCheck.missing.forEach((m) => console.error(`   - Missing: ${m}`));
  process.exit(1);
}
liveCheck.warnings.forEach((w) => console.warn(`⚠️ ${w}`));
await validateAllApiKeys();

// 마켓 루프 시작 (실시간 가격 피드 → 전략)
import { marketLoopService } from "./modules/market";
marketLoopService.start();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  marketLoopService.stop();
  process.exit(0);
});
