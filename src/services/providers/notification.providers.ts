import { Resend } from "resend";
import { envConfig } from "../../config/env.config";
import { logger } from "../../config/logger";

const log = logger.child({ module: "notification-providers" });

// Every real provider (Resend, Twilio, FCM, etc.) implements this shape.
// Swapping mock → real means adding a class here and changing the
// provider selection in notification.service.ts — nothing else changes.
export interface NotificationProvider {
  send(recipient: string, message: string, subject?: string): Promise<boolean>;
}

export class MockEmailProvider implements NotificationProvider {
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

// SMS gets its own result shape (rather than reusing NotificationProvider's
// plain boolean) so the real failure reason — e.g. a Twilio trial limitation —
// can be surfaced on the notification record instead of a generic message.
export interface SmsSendResult {
  success: boolean;
  error?: string;
}

export interface SmsNotificationProvider {
  send(recipient: string, message: string): Promise<SmsSendResult>;
}

export class MockSmsProvider implements SmsNotificationProvider {
  async send(recipient: string, message: string): Promise<SmsSendResult> {
    const delay = Math.random() * 200 + 100; // 100-300ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    const success = Math.random() > 0.15; // 85% success rate

    if (success) {
      log.info({ recipient }, "SMS sent (mock)");
      return { success: true };
    }

    const error = "Mock SMS provider simulated failure";
    log.warn({ recipient }, "SMS failed (mock)");
    return { success: false, error };
  }
}

export class MockPushProvider implements NotificationProvider {
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

const resendClient = new Resend(envConfig.resendApiKey);

export class ResendEmailProvider implements NotificationProvider {
  async send(
    recipient: string,
    message: string,
    subject = "Notification",
  ): Promise<boolean> {
    try {
      const { data, error } = await resendClient.emails.send({
        from: envConfig.emailFrom,
        to: recipient,
        subject,
        text: message,
      });

      if (error) {
        log.warn({ recipient, subject, err: error }, "Email failed (Resend)");
        return false;
      }

      log.info(
        { recipient, subject, emailId: data?.id },
        "Email sent (Resend)",
      );
      return true;
    } catch (error) {
      log.error({ err: error, recipient, subject }, "Error calling Resend");
      return false;
    }
  }
}
