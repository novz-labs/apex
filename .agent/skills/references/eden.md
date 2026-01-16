# Eden Treaty - End-to-End 타입 안전 클라이언트

Elysia 서버와 타입을 공유하는 클라이언트 라이브러리. tRPC와 유사하지만 코드 생성 없이 동작.

## 설치

```bash
bun add @elysiajs/eden
# 또는
npm install @elysiajs/eden
```

## 기본 사용법

### 서버 (타입 export)

```typescript
// server.ts
import { Elysia, t } from "elysia";

const app = new Elysia()
  .get(
    "/user/:id",
    ({ params }) => ({
      id: params.id,
      name: "John",
    }),
    {
      params: t.Object({ id: t.String() }),
    }
  )
  .post(
    "/user",
    ({ body }) => ({
      success: true,
      user: body,
    }),
    {
      body: t.Object({
        name: t.String(),
        email: t.String(),
      }),
    }
  )
  .listen(3000);

export type App = typeof app;
```

### 클라이언트

```typescript
// client.ts
import { treaty } from "@elysiajs/eden";
import type { App } from "./server";

const api = treaty<App>("localhost:3000");

// GET /user/:id - 경로 파라미터는 객체로
const { data, error } = await api.user({ id: "123" }).get();
// data 타입: { id: string, name: string }

// POST /user - body 전달
const { data: newUser } = await api.user.post({
  name: "Jane",
  email: "jane@example.com",
});
// newUser 타입: { success: boolean, user: { name: string, email: string } }
```

## 응답 처리

```typescript
const { data, error, status, response, headers } = await api.users.get();

if (error) {
  // error 타입은 서버에서 정의한 에러 타입으로 추론
  console.error(error.message);
  return;
}

// data는 성공 응답 타입
console.log(data);
```

## 쿼리 파라미터

```typescript
// 서버
app.get("/search", ({ query }) => query, {
  query: t.Object({
    q: t.String(),
    page: t.Optional(t.Number()),
  }),
});

// 클라이언트
const { data } = await api.search.get({
  query: {
    q: "elysia",
    page: 1,
  },
});
```

## 헤더 전달

```typescript
const api = treaty<App>("localhost:3000", {
  headers: {
    Authorization: "Bearer token",
  },
});

// 또는 요청별로
const { data } = await api.protected.get({
  headers: {
    "X-Custom-Header": "value",
  },
});
```

## WebSocket

```typescript
// 서버
app.ws("/chat", {
  body: t.String(),
  message(ws, message) {
    ws.send(`Echo: ${message}`);
  },
});

// 클라이언트
const chat = api.chat.subscribe();

chat.on("message", (msg) => {
  console.log("Received:", msg.data);
});

chat.send("Hello!");
chat.close();
```

## 파일 업로드

```typescript
// 서버
app.post("/upload", ({ body }) => body.file.name, {
  body: t.Object({
    file: t.File(),
  }),
});

// 클라이언트
const { data } = await api.upload.post({
  file: new File(["content"], "test.txt"),
});
```

## Eden Fetch (대체 API)

treaty보다 fetch API에 가까운 인터페이스:

```typescript
import { edenFetch } from "@elysiajs/eden";
import type { App } from "./server";

const fetch = edenFetch<App>("localhost:3000");

const { data } = await fetch("/user/:id", {
  method: "GET",
  params: { id: "123" },
});
```

## 에러 타입 안전성

서버에서 정의한 에러 응답도 타입으로 추론:

```typescript
// 서버
app.get(
  "/user/:id",
  ({ params, set }) => {
    if (params.id === "invalid") {
      set.status = 404;
      return { error: "User not found" };
    }
    return { id: params.id, name: "John" };
  },
  {
    response: {
      200: t.Object({ id: t.String(), name: t.String() }),
      404: t.Object({ error: t.String() }),
    },
  }
);

// 클라이언트
const { data, error } = await api.user({ id: "invalid" }).get();

if (error) {
  // error.value 타입: { error: string }
  console.log(error.value.error); // 'User not found'
}
```

## 인터셉터

```typescript
const api = treaty<App>("localhost:3000", {
  onRequest: (path, options) => {
    console.log(`Request: ${path}`);
    return options;
  },
  onResponse: (response) => {
    console.log(`Status: ${response.status}`);
    return response;
  },
});
```
