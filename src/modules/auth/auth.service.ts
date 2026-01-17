// src/modules/auth/auth.service.ts

/**
 * 인증 및 보안 서비스
 */
export class AuthService {
  private adminApiKey: string | null = null;

  constructor() {
    this.adminApiKey = process.env.ADMIN_API_KEY || null;

    if (!this.adminApiKey) {
      console.warn("⚠️ ADMIN_API_KEY is not set. API will be unprotected!");
    }
  }

  /**
   * API Key 유효성 검사
   */
  isValidApiKey(key: string): boolean {
    if (!this.adminApiKey) return true; // 설정 안되어있으면 통과 (개발 편의성)

    // Authorization: Bearer <key> 또는 직접 전달된 key 확인
    const actualKey = key.startsWith("Bearer ") ? key.slice(7) : key;
    return actualKey === this.adminApiKey;
  }

  /**
   * 현재 관리자 키 설정 여부
   */
  isConfigured(): boolean {
    return !!this.adminApiKey;
  }
}

export const authService = new AuthService();
