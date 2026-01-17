// src/modules/config/api-validator.ts

import {
  publicRequest,
  syncServerTime as syncBinanceTime,
} from "../exchange/binance.client";
import * as hyperliquidClient from "../exchange/hyperliquid.client";

// ============================================
// API Key Validation
// ============================================

export interface ValidationResult {
  exchange: string;
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * 서버 시작 시 모든 API 키 검증
 */
export async function validateAllApiKeys(): Promise<{
  hyperliquid: ValidationResult;
  binance: ValidationResult;
  openai: ValidationResult;
  telegram: ValidationResult;
}> {
  console.log("🔐 Validating API keys...");

  const results = await Promise.all([
    validateHyperliquid(),
    validateBinance(),
    validateOpenAI(),
    validateTelegram(),
  ]);

  const [hyperliquid, binance, openai, telegram] = results;

  // 결과 로깅
  logValidationResult("Hyperliquid", hyperliquid);
  logValidationResult("Binance", binance);
  logValidationResult("OpenAI", openai);
  logValidationResult("Telegram", telegram);

  return { hyperliquid, binance, openai, telegram };
}

function logValidationResult(name: string, result: ValidationResult): void {
  if (result.valid) {
    console.log(`   ✅ ${name}: Valid`);
  } else if (result.error?.includes("not configured")) {
    console.log(`   ⚪ ${name}: Not configured (optional)`);
  } else {
    console.log(`   ❌ ${name}: ${result.error}`);
  }
}

// ============================================
// Hyperliquid Validation
// ============================================

async function validateHyperliquid(): Promise<ValidationResult> {
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  const walletAddress = process.env.HYPERLIQUID_WALLET_ADDRESS;

  if (!privateKey || !walletAddress || privateKey === "0x...") {
    return {
      exchange: "hyperliquid",
      valid: false,
      error: "Keys not configured",
    };
  }

  try {
    // Info client로 잔고 조회 시도
    const infoClient = hyperliquidClient.getInfoClient();
    const clearinghouseState = await infoClient.clearinghouseState({
      user: walletAddress,
    });

    return {
      exchange: "hyperliquid",
      valid: true,
      details: {
        accountValue: clearinghouseState.marginSummary?.accountValue || "0",
        testnet: process.env.HYPERLIQUID_TESTNET === "true",
      },
    };
  } catch (error) {
    return {
      exchange: "hyperliquid",
      valid: false,
      error: `Connection failed: ${String(error)}`,
    };
  }
}

// ============================================
// Binance Validation
// ============================================

async function validateBinance(): Promise<ValidationResult> {
  const apiKey = process.env.BINANCE_API_KEY;
  const secretKey = process.env.BINANCE_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return {
      exchange: "binance",
      valid: false,
      error: "Keys not configured",
    };
  }

  try {
    // 서버 시간 동기화 (ping 역할)
    await syncBinanceTime();

    // Public endpoint로 거래소 상태 확인
    const exchangeInfo = await publicRequest<{ serverTime: number }>(
      "/fapi/v1/time"
    );

    return {
      exchange: "binance",
      valid: true,
      details: {
        serverTime: new Date(exchangeInfo.serverTime).toISOString(),
        testnet: process.env.BINANCE_TESTNET === "true",
      },
    };
  } catch (error) {
    return {
      exchange: "binance",
      valid: false,
      error: `Connection failed: ${String(error)}`,
    };
  }
}

// ============================================
// OpenAI Validation
// ============================================

async function validateOpenAI(): Promise<ValidationResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === "sk-...") {
    return {
      exchange: "openai",
      valid: false,
      error: "Key not configured",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return {
        exchange: "openai",
        valid: true,
      };
    } else {
      const error = await response.text();
      return {
        exchange: "openai",
        valid: false,
        error: `Invalid key: ${response.status}`,
      };
    }
  } catch (error) {
    return {
      exchange: "openai",
      valid: false,
      error: `Connection failed: ${String(error)}`,
    };
  }
}

// ============================================
// Telegram Validation
// ============================================

async function validateTelegram(): Promise<ValidationResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return {
      exchange: "telegram",
      valid: false,
      error: "Not configured (optional)",
    };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`
    );

    if (response.ok) {
      const data = (await response.json()) as {
        ok: boolean;
        result: { username: string };
      };
      return {
        exchange: "telegram",
        valid: true,
        details: {
          botUsername: data.result?.username,
        },
      };
    } else {
      return {
        exchange: "telegram",
        valid: false,
        error: "Invalid bot token",
      };
    }
  } catch (error) {
    return {
      exchange: "telegram",
      valid: false,
      error: `Connection failed: ${String(error)}`,
    };
  }
}

// ============================================
// Live Mode Safety Check
// ============================================

export async function checkLiveModeRequirements(): Promise<{
  canGoLive: boolean;
  missing: string[];
  warnings: string[];
}> {
  const missing: string[] = [];
  const warnings: string[] = [];

  const paperMode = process.env.PAPER_MODE !== "false";

  if (paperMode) {
    return {
      canGoLive: true, // Paper mode doesn't need real keys
      missing: [],
      warnings: ["Running in PAPER mode - no real trades will be executed"],
    };
  }

  // Live mode - check required keys
  const exchange = process.env.EXCHANGE || "hyperliquid";

  if (exchange === "hyperliquid") {
    if (
      !process.env.HYPERLIQUID_PRIVATE_KEY ||
      process.env.HYPERLIQUID_PRIVATE_KEY === "0x..."
    ) {
      missing.push("HYPERLIQUID_PRIVATE_KEY");
    }
    if (
      !process.env.HYPERLIQUID_WALLET_ADDRESS ||
      process.env.HYPERLIQUID_WALLET_ADDRESS === "0x..."
    ) {
      missing.push("HYPERLIQUID_WALLET_ADDRESS");
    }
  }

  if (exchange === "binance") {
    if (!process.env.BINANCE_API_KEY) {
      missing.push("BINANCE_API_KEY");
    }
    if (!process.env.BINANCE_SECRET_KEY) {
      missing.push("BINANCE_SECRET_KEY");
    }
  }

  // OpenAI is required for AI features
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "sk-...") {
    warnings.push("OPENAI_API_KEY not set - AI features disabled");
  }

  // Telegram is optional
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    warnings.push("TELEGRAM_BOT_TOKEN not set - notifications disabled");
  }

  return {
    canGoLive: missing.length === 0,
    missing,
    warnings,
  };
}
