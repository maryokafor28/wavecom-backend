import { NotificationChannel } from "../types";
import { logger } from "../config/logger";
import { envConfig } from "../config/env.config";

const log = logger.child({ module: "notification-service" });

// Every real provider (Resend, Twilio, FCM, etc.) implements this shape.
// Swapping mock → real later means adding a new class here and changing
// the provider selection at the bottom — nothing else in the app changes.
interface NotificationProvider {
  send(recipient: string, message: string, subject?: string): Promise<boolean>;
}

class MockEmailProvider implements NotificationProvider {
  async send(
    recipient: string,
    message: string,
    subject = "Notification",
  ): Promise<boolean> {
    const delay = Math.random() * 300 + 200; // 200-500ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
      log.info({ recipient, subject }, "Email sent (mock)");
    } else {
      log.warn({ recipient, subject }, "Email failed (mock)");
    }

    return success;
  }
}

class MockSmsProvider implements NotificationProvider {
  async send(recipient: string, message: string): Promise<boolean> {
    const delay = Math.random() * 200 + 100; // 100-300ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    const success = Math.random() > 0.15; // 85% success rate

    if (success) {
      log.info({ recipient }, "SMS sent (mock)");
    } else {
      log.warn({ recipient }, "SMS failed (mock)");
    }

    return success;
  }
}

class MockPushProvider implements NotificationProvider {
  async send(recipient: string, message: string): Promise<boolean> {
    const delay = Math.random() * 100 + 50; // 50-150ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    const success = Math.random() > 0.05; // 95% success rate

    if (success) {
      log.info({ recipient }, "Push notification sent (mock)");
    } else {
      log.warn({ recipient }, "Push failed (mock)");
    }

    return success;
  }
}

// Real providers get added here later, e.g.:
// class ResendEmailProvider implements NotificationProvider { ... }

const SEND_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Send timed out after ${ms}ms`)),
      ms,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

class NotificationService {
  // Provider selection point — this is the only place that changes when
  // you swap a mock for a real provider. In prod, envConfig.nodeEnv can
  // gate which class gets instantiated here.
  private providers: Record<NotificationChannel, NotificationProvider> = {
    email: new MockEmailProvider(),
    sms: new MockSmsProvider(),
    push: new MockPushProvider(),
  };

  async send(
    channel: NotificationChannel,
    recipient: string,
    message: string,
    subject?: string,
  ): Promise<boolean> {
    log.info({ channel, recipient }, "Sending notification");

    const provider = this.providers[channel];

    if (!provider) {
      log.error({ channel }, "Unsupported notification channel");
      return false;
    }

    try {
      return await withTimeout(
        provider.send(recipient, message, subject),
        SEND_TIMEOUT_MS,
      );
    } catch (error) {
      log.error(
        { err: error, channel, recipient },
        "Error in notification provider",
      );
      return false;
    }
  }
}

export const notificationService = new NotificationService();
