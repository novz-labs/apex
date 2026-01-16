// src/modules/notification/telegram.service.ts

// ============================================
// 타입 정의
// ============================================

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface NotificationOptions {
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_notification?: boolean;
}

// ============================================
// 텔레그램 알림 서비스
// ============================================

class TelegramService {
  private config: TelegramConfig | null = null;
  private enabled: boolean = false;
  private messageQueue: Array<{ text: string; options?: NotificationOptions }> =
    [];
  private isProcessing: boolean = false;

  /**
   * 서비스 초기화
   */
  initialize(config?: Partial<TelegramConfig>): void {
    const botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = config?.chatId || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn(
        "⚠️ Telegram not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing)"
      );
      this.enabled = false;
      return;
    }

    this.config = { botToken, chatId };
    this.enabled = true;
    console.log("📱 Telegram notification service initialized");
  }

  /**
   * 메시지 전송
   */
  async sendMessage(
    text: string,
    options?: NotificationOptions
  ): Promise<boolean> {
    if (!this.enabled || !this.config) {
      console.log(`[Telegram-Disabled] ${text.substring(0, 50)}...`);
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: options?.parse_mode || "HTML",
          disable_notification: options?.disable_notification || false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("❌ Telegram API error:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("❌ Telegram send failed:", error);
      return false;
    }
  }

  /**
   * 거래 알림
   */
  async notifyTrade(params: {
    type: "open" | "close";
    symbol: string;
    side: "long" | "short";
    price: number;
    size?: number;
    pnl?: number;
    reason?: string;
  }): Promise<void> {
    const emoji = params.type === "open" ? "🟢" : "🔴";
    const sideEmoji = params.side === "long" ? "📈" : "📉";

    let message = `${emoji} <b>${params.type.toUpperCase()}</b> ${sideEmoji} ${params.side.toUpperCase()}\n`;
    message += `📊 <b>${params.symbol}</b>\n`;
    message += `💰 Price: $${params.price.toFixed(2)}\n`;

    if (params.size) {
      message += `📦 Size: ${params.size.toFixed(4)}\n`;
    }

    if (params.pnl !== undefined) {
      const pnlEmoji = params.pnl >= 0 ? "✅" : "❌";
      message += `${pnlEmoji} PnL: $${params.pnl.toFixed(2)}\n`;
    }

    if (params.reason) {
      message += `📝 ${params.reason}`;
    }

    await this.sendMessage(message);
  }

  /**
   * 전략 시그널 알림
   */
  async notifySignal(params: {
    strategy: string;
    symbol: string;
    direction: "long" | "short" | "none";
    confidence: number;
    reasons: string[];
  }): Promise<void> {
    if (params.direction === "none") return;

    const dirEmoji = params.direction === "long" ? "🟢📈" : "🔴📉";

    let message = `⚡ <b>Signal: ${params.strategy}</b>\n`;
    message += `${dirEmoji} ${params.direction.toUpperCase()} ${params.symbol}\n`;
    message += `📊 Confidence: ${(params.confidence * 100).toFixed(0)}%\n`;
    message += `📝 Reasons:\n`;

    for (const reason of params.reasons.slice(0, 5)) {
      message += `  • ${reason}\n`;
    }

    await this.sendMessage(message);
  }

  /**
   * 알림 (일반)
   */
  async notifyAlert(params: {
    level: "info" | "warning" | "error";
    title: string;
    message: string;
  }): Promise<void> {
    const levelEmoji = {
      info: "ℹ️",
      warning: "⚠️",
      error: "🚨",
    }[params.level];

    const text = `${levelEmoji} <b>${params.title}</b>\n${params.message}`;
    await this.sendMessage(text);
  }

  /**
   * 일일 요약 알림
   */
  async notifyDailySummary(params: {
    balance: number;
    dailyPnl: number;
    totalTrades: number;
    winRate: number;
    drawdown: number;
  }): Promise<void> {
    const pnlEmoji = params.dailyPnl >= 0 ? "✅" : "❌";

    let message = `📊 <b>Daily Summary</b>\n\n`;
    message += `💰 Balance: $${params.balance.toFixed(2)}\n`;
    message += `${pnlEmoji} Daily PnL: $${params.dailyPnl.toFixed(2)}\n`;
    message += `📈 Trades: ${params.totalTrades}\n`;
    message += `🎯 Win Rate: ${(params.winRate * 100).toFixed(1)}%\n`;
    message += `📉 Drawdown: ${params.drawdown.toFixed(2)}%`;

    await this.sendMessage(message);
  }

  /**
   * 상태 확인
   */
  getStatus(): {
    enabled: boolean;
    configured: boolean;
  } {
    return {
      enabled: this.enabled,
      configured: !!this.config,
    };
  }

  /**
   * 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(
      `📱 Telegram notifications ${enabled ? "enabled" : "disabled"}`
    );
  }
}

export const telegramService = new TelegramService();
