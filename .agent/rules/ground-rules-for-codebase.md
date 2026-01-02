---
trigger: always_on
---

# Project Rules for AI Assistant

## 🎯 프로젝트 목표

- **수익 목표**: $1,000 → $10,000 (2026년 상반기)
- **방법**: AI 피드백 루프 기반 자동매매 봇

## 🛠️ 기술 스택 (필수 준수)

### 런타임 & 언어

- **Bun** (Node.js 대신)
- **TypeScript** (strict mode)

### 프레임워크

- **Elysia** - REST API + WebSocket
- **Prisma** - ORM
- **SQLite** - 로컬 DB

### 주요 라이브러리

- `trading-signals` - 기술 지표
- `@openai` - openai sdk
- `zod` - 스키마 검증

## 📁 파일 구조 규칙

```
src/
├── services/      # 비즈니스 로직 (*.service.ts)
├── strategies/    # 매매 전략 (*.strategy.ts)
├── exchanges/     # 거래소 클라이언트 (*.client.ts)
├── api/routes/    # API 라우트 (*.ts)
├── jobs/          # 크론 작업 (*.job.ts)
└── types/         # 타입 정의 (index.ts)
```

## ✅ 코드 작성 규칙

### 1. 항상 TypeScript 타입 명시

```typescript
// ✅ Good
function calculatePnL(entry: number, exit: number, size: number): number {
  return (exit - entry) * size;
}

// ❌ Bad
function calculatePnL(entry, exit, size) {
  return (exit - entry) * size;
}
```

### 2. 에러 처리 필수

```typescript
// ✅ Good
try {
  const data = await fetchPrice();
  return data;
} catch (error) {
  console.error("Failed to fetch price:", error);
  throw new Error("Price fetch failed");
}
```

### 3. 리스크 관리 로직 포함

```typescript
// ✅ 모든 매매 로직에 포함
const MAX_POSITION_PERCENT = 40; // 최대 포지션
const MAX_LEVERAGE = 5; // 최대 레버리지
const STOP_LOSS_PERCENT = 2; // 손절
```

### 4. 환경변수 사용

```typescript
// ✅ Good
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY required");

// ❌ Bad - 하드코딩 금지
const apiKey = "sk-ant-xxx";
```

## 🔧 Elysia 패턴

### 라우트 정의

```typescript
import { Elysia, t } from "elysia";

export const statusRoutes = new Elysia({ prefix: "/status" })
  .get("/", async () => {
    return { status: "ok" };
  })
  .get("/balance", async () => {
    // ...
  });
```

### 메인 서버

```typescript
import { Elysia } from "elysia";
import { statusRoutes } from "./api/routes/status";

const app = new Elysia().use(statusRoutes).listen(3000);
```

## 📊 Prisma 사용

### 쿼리 패턴

```typescript
// ✅ Good - 트랜잭션 사용
await prisma.$transaction(async (tx) => {
  await tx.trade.create({ data: tradeData });
  await tx.strategy.update({ where: { id }, data: updateData });
});
```

## 🤖 AI 피드백 루프 규칙

### 파라미터 변경 제한

- 한 번에 최대 **±20%** 변경
- **Critical** 우선순위는 수동 승인 필요
- 최소 분석 간격: **60분**

### AI 응답 파싱

```typescript
// 항상 JSON 파싱 에러 처리
try {
  const result = JSON.parse(response);
} catch {
  return { error: "Invalid AI response" };
}
```

## 🚫 금지 사항

1. **하드코딩된 API 키**
2. **any 타입 남용**
3. **리스크 관리 없는 매매 로직**
4. **에러 처리 없는 외부 API 호출**
5. **동기적 파일 I/O**
6. **명령어로 npm, npx, yarn과 같은 bun, bunx가 아닌 명령어 사용**

## 📝 커밋 메시지 형식

```
feat: 새 기능 추가
fix: 버그 수정
refactor: 리팩토링
docs: 문서 수정
chore: 기타 작업
```

## 🔗 참고 문서

- `CLAUDE.md` - 프로젝트 컨텍스트
- `docs/architecture.md` - 아키텍처 상세
- `docs/external-data-and-strategy.md` - 외부 API 및 전략
