# Elysia 프레임워크 통합

Elysia는 WinterCG 호환으로 다양한 환경에서 실행 가능.

## Next.js

### App Router (권장)

```typescript
// app/api/[[...slugs]]/route.ts
import { Elysia, t } from "elysia";

const app = new Elysia({ prefix: "/api" })
  .get("/hello", () => "Hello from Elysia")
  .post("/user", ({ body }) => body, {
    body: t.Object({ name: t.String() }),
  });

export const GET = app.handle;
export const POST = app.handle;
```

### Pages Router

```typescript
// pages/api/[[...slugs]].ts
import { Elysia } from "elysia";

const app = new Elysia({ prefix: "/api" }).get("/hello", () => "Hello");

export default async function handler(req, res) {
  const response = await app.handle(req);
  // Next.js 응답으로 변환
  res.status(response.status);
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await response.text());
}
```

## Node.js

Bun 없이 Node.js에서 사용:

```typescript
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const app = new Elysia({ adapter: node() })
  .get("/", () => "Hello Node.js")
  .listen(3000, ({ hostname, port }) => {
    console.log(`Running at ${hostname}:${port}`);
  });
```

설치:

```bash
npm install elysia @elysiajs/node
npm install -D tsx @types/node typescript
```

## Deno

```typescript
import { Elysia } from "npm:elysia";

const app = new Elysia().get("/", () => "Hello Deno");

Deno.serve(app.fetch);
```

## Cloudflare Workers

```typescript
import { Elysia } from "elysia";

const app = new Elysia().get("/", () => "Hello Cloudflare");

export default {
  fetch: app.fetch,
};
```

wrangler.toml:

```toml
name = "elysia-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
```

## Vercel

```typescript
// api/index.ts (Edge Functions)
import { Elysia } from "elysia";

const app = new Elysia()
  .get("/api", () => "Hello Vercel")
  .get("/api/user/:id", ({ params }) => params.id);

export const GET = app.handle;
export const POST = app.handle;

export const config = {
  runtime: "edge",
};
```

## Astro

```typescript
// src/pages/api/[...slugs].ts
import { Elysia } from "elysia";
import type { APIRoute } from "astro";

const app = new Elysia({ prefix: "/api" }).get("/hello", () => "Hello Astro");

const handler: APIRoute = ({ request }) => app.handle(request);

export const GET = handler;
export const POST = handler;
```

## SvelteKit

```typescript
// src/routes/api/[...slugs]/+server.ts
import { Elysia } from "elysia";
import type { RequestHandler } from "./$types";

const app = new Elysia({ prefix: "/api" }).get(
  "/hello",
  () => "Hello SvelteKit"
);

export const GET: RequestHandler = ({ request }) => app.handle(request);
export const POST: RequestHandler = ({ request }) => app.handle(request);
```

## Nuxt

```typescript
// server/api/[...].ts
import { Elysia } from "elysia";

const app = new Elysia({ prefix: "/api" }).get("/hello", () => "Hello Nuxt");

export default defineEventHandler((event) => {
  return app.handle(event.node.req);
});
```

## Docker 배포

```dockerfile
FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
```

## PM2 (Node.js)

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "elysia-app",
      script: "dist/index.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```

## 환경변수

```typescript
import { Elysia } from "elysia";

const app = new Elysia()
  .get("/config", () => ({
    env: process.env.NODE_ENV,
    port: process.env.PORT,
  }))
  .listen(process.env.PORT || 3000);
```

Bun의 경우 `.env` 자동 로드:

```bash
# .env
PORT=3000
DATABASE_URL=postgres://...
```
