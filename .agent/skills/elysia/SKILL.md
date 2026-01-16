---
name: elysia
description: Elysia.js - Bun 기반 고성능 TypeScript 백엔드 프레임워크. End-to-End 타입 안전성, TypeBox/Standard Schema 검증, Eden Treaty 클라이언트를 제공. Elysia로 API 서버를 만들거나, 라우팅/검증/플러그인 관련 질문, Next.js/Node.js 통합이 필요할 때 사용.
---

# Elysia.js

Bun에 최적화된 인체공학적 TypeScript 백엔드 프레임워크.

## 핵심 특징

- **고성능**: Bun 런타임 최적화, Express 대비 10배 이상 빠름
- **End-to-End 타입 안전성**: 런타임 + 컴파일타임 타입 검증
- **OpenAPI 자동 생성**: 스키마 기반 API 문서 자동화
- **Eden Treaty**: tRPC와 유사한 타입 안전 클라이언트

## Quick Start

```bash
# Bun
bun create elysia app && cd app && bun dev

# Node.js
npm install elysia @elysiajs/node
```

```typescript
// Bun
import { Elysia } from "elysia";

new Elysia()
  .get("/", "Hello Elysia")
  .get("/user/:id", ({ params: { id } }) => id)
  .post("/form", ({ body }) => body)
  .listen(3000);

// Node.js
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

new Elysia({ adapter: node() }).get("/", "Hello Elysia").listen(3000);
```

## 라우팅

### Path 타입

```typescript
new Elysia()
  .get("/static", "static path") // 정적 경로
  .get("/user/:id", ({ params }) => params.id) // 동적 경로
  .get("/files/*", ({ params }) => params["*"]) // 와일드카드
  .get("/optional/:name?", ({ params }) => params.name); // 선택적
```

### 그룹 & 프리픽스

```typescript
// 그룹
new Elysia().group("/api", (app) =>
  app.get("/users", () => "users").get("/posts", () => "posts")
);

// 프리픽스 (플러그인)
const users = new Elysia({ prefix: "/users" })
  .get("/", () => "all users")
  .get("/:id", ({ params }) => params.id);

new Elysia().use(users);
```

## 검증 (Validation)

Elysia.t (TypeBox 기반) 또는 Standard Schema (Zod, Valibot 등) 사용.

```typescript
import { Elysia, t } from "elysia";

new Elysia().post("/user", ({ body }) => body, {
  body: t.Object({
    name: t.String(),
    age: t.Number(),
  }),
  query: t.Object({
    page: t.Optional(t.Number()),
  }),
  response: {
    200: t.Object({ id: t.String() }),
    400: t.Object({ error: t.String() }),
  },
});
```

### Standard Schema (Zod/Valibot)

```typescript
import { z } from "zod";
import * as v from "valibot";

new Elysia().get("/id/:id", ({ params }) => params.id, {
  params: z.object({ id: z.coerce.number() }),
  query: v.object({ name: v.string() }),
});
```

## 주요 레퍼런스

- **플러그인 & 라이프사이클**: `references/plugins.md` 참조
- **Eden Treaty (클라이언트)**: `references/eden.md` 참조
- **프레임워크 통합 (Next.js 등)**: `references/integrations.md` 참조

## 자주 쓰는 플러그인

```typescript
import { openapi } from "@elysiajs/openapi"; // OpenAPI/Swagger
import { cors } from "@elysiajs/cors"; // CORS
import { jwt } from "@elysiajs/jwt"; // JWT 인증
import { bearer } from "@elysiajs/bearer"; // Bearer 토큰
import { staticPlugin } from "@elysiajs/static"; // 정적 파일

new Elysia()
  .use(openapi())
  .use(cors())
  .use(jwt({ secret: "secret" }));
```

## Context & 파생 상태

```typescript
new Elysia()
  .state("version", "1.0.0")
  .decorate("db", new Database())
  .derive(({ headers }) => ({
    auth: headers["authorization"],
  }))
  .get("/", ({ store, db, auth }) => {
    // store.version, db, auth 사용 가능
  });
```

## 에러 처리

```typescript
import { Elysia, error } from "elysia";

new Elysia()
  .onError(({ code, error: e }) => {
    if (code === "VALIDATION") return e.message;
    if (code === "NOT_FOUND") return "Not Found";
  })
  .get("/fail", () => error(400, "Bad Request"));
```

## 공식 문서

전체 문서: https://elysiajs.com
