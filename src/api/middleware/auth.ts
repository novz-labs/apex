// src/api/middleware/auth.ts
import { Elysia } from "elysia";
import { authService } from "../../modules/auth/auth.service";

/**
 * API 인증 미들웨어
 * - GET 요청: 기본적으로 허용 (Public)
 * - POST, PUT, DELETE 요청: Authorization 헤더 또는 X-API-KEY 필요
 */
export const authGuard = new Elysia({ name: "authGuard" }).onBeforeHandle(
  ({ request, set, headers }) => {
    const method = request.method;
    const path = new URL(request.url).pathname;

    // 1. GET 요청은 허용 (단, /swagger 나 / 는 무조건 허용)
    // 현재는 모든 GET을 허용하되 추후 민감한 GET은 따로 처리 가능
    if (method === "GET") return;

    // 2. Swagger 관련 경로는 허용
    if (path.startsWith("/swagger")) return;

    // 3. 인증 체크 (Authorization: Bearer <key> 또는 X-API-KEY)
    const authHeader = headers["authorization"];
    const xApiKey = headers["x-api-key"];
    const key = (authHeader || xApiKey) as string;

    if (!key || !authService.isValidApiKey(key)) {
      set.status = 401;
      return {
        success: false,
        error: "Unauthorized",
        message: "This action requires a valid ADMIN_API_KEY.",
      };
    }
  }
);
