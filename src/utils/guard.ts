import { Elysia, status } from "elysia";
import { rateLimit } from "elysia-rate-limit";

export const securityGuard = (allowedIp: string, apiKey: string) =>
  new Elysia()
    .use(
      rateLimit({
        max: 10,
        duration: 1_000, // 1초당 10개 요청
        generator: (req) =>
          req.headers.get("x-forwarded-for") ??
          req.headers.get("x-real-ip") ??
          "unknown",
      })
    )
    .guard({
      beforeHandle: async ({ request }) => {
        const clientIp =
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          (request as any).ip;

        if (clientIp !== allowedIp) {
          throw status(403, "Forbidden - IP not allowed");
        }

        const auth = request.headers.get("authorization");

        if (!auth?.startsWith("Bearer ") || auth.slice(7) !== apiKey) {
          throw status(401, "Unauthorized - bad API key");
        }
      },
    });
