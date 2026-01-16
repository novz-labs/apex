# Elysia 플러그인 & 라이프사이클

## 라이프사이클 훅

요청 처리 순서: `onRequest` → `parse` → `onParse` → `onTransform` → `onBeforeHandle` → `handler` → `onAfterHandle` → `mapResponse` → `onAfterResponse`

### 주요 훅

```typescript
new Elysia()
  // 요청 시작 시
  .onRequest(({ request }) => {
    console.log(`${request.method} ${request.url}`);
  })
  // 핸들러 전
  .onBeforeHandle(({ set, headers }) => {
    if (!headers["authorization"]) {
      set.status = 401;
      return "Unauthorized";
    }
  })
  // 핸들러 후 (응답 변환)
  .onAfterHandle(({ response }) => {
    return { data: response, timestamp: Date.now() };
  })
  // 에러 처리
  .onError(({ code, error }) => {
    if (code === "NOT_FOUND") return "Not Found";
    if (code === "VALIDATION") return error.message;
  });
```

### 커스텀 파싱

```typescript
new Elysia().onParse(({ request, contentType }) => {
  if (contentType === "application/custom") {
    return request.text();
  }
});
```

## 플러그인

### 플러그인 생성

```typescript
const myPlugin = new Elysia({ name: "my-plugin" })
  .decorate("myUtil", () => "utility")
  .derive(({ headers }) => ({
    userId: headers["x-user-id"],
  }));

new Elysia().use(myPlugin);
```

### 스코프와 전파

```typescript
// 'scoped' - 현재 인스턴스와 자식에만 적용
// 'global' - 모든 인스턴스에 적용
// 'local' (기본) - 현재 인스턴스에만 적용

const plugin = new Elysia().onBeforeHandle({ as: "global" }, () => {
  console.log("모든 곳에서 실행");
});
```

## 공식 플러그인

### CORS

```typescript
import { cors } from "@elysiajs/cors";

new Elysia().use(
  cors({
    origin: ["https://example.com"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
```

### JWT

```typescript
import { jwt } from "@elysiajs/jwt";

new Elysia()
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
    })
  )
  .post("/login", async ({ jwt, body }) => {
    const token = await jwt.sign({ userId: body.id });
    return { token };
  })
  .get("/profile", async ({ jwt, headers, set }) => {
    const payload = await jwt.verify(headers.authorization?.split(" ")[1]);
    if (!payload) {
      set.status = 401;
      return "Invalid token";
    }
    return payload;
  });
```

### Bearer

```typescript
import { bearer } from "@elysiajs/bearer";

new Elysia().use(bearer()).get(
  "/protected",
  ({ bearer }) => {
    return `Token: ${bearer}`;
  },
  {
    beforeHandle: ({ bearer, set }) => {
      if (!bearer) {
        set.status = 401;
        return "Unauthorized";
      }
    },
  }
);
```

### OpenAPI / Swagger

```typescript
import { openapi } from "@elysiajs/openapi";

new Elysia()
  .use(
    openapi({
      documentation: {
        info: { title: "My API", version: "1.0.0" },
      },
      path: "/docs", // Swagger UI 경로
    })
  )
  .get("/users", () => [], {
    detail: {
      tags: ["Users"],
      summary: "Get all users",
    },
  });
```

### Static 파일

```typescript
import { staticPlugin } from "@elysiajs/static";

new Elysia().use(
  staticPlugin({
    assets: "public",
    prefix: "/static",
  })
);
```

### WebSocket

```typescript
new Elysia().ws("/chat", {
  message(ws, message) {
    ws.send(`Echo: ${message}`);
  },
  open(ws) {
    console.log("Connected");
  },
  close(ws) {
    console.log("Disconnected");
  },
});
```

### Cron

```typescript
import { cron } from "@elysiajs/cron";

new Elysia().use(
  cron({
    name: "heartbeat",
    pattern: "*/10 * * * * *", // 매 10초
    run() {
      console.log("tick");
    },
  })
);
```

## Guard

```typescript
new Elysia().guard(
  {
    headers: t.Object({
      authorization: t.String(),
    }),
  },
  (app) =>
    app
      .get("/profile", () => "protected")
      .get("/settings", () => "also protected")
);
```

## Macro

반복 패턴을 재사용 가능한 매크로로 추상화:

```typescript
const app = new Elysia()
  .macro({
    auth(enabled: boolean) {
      if (!enabled) return;

      return {
        beforeHandle({ headers, set }) {
          if (!headers.authorization) {
            set.status = 401;
            return "Unauthorized";
          }
        },
      };
    },
  })
  .get("/public", () => "public")
  .get("/private", () => "private", { auth: true });
```
