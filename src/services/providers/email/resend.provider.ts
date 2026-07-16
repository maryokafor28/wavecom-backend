import { Resend } from "resend";
import { envConfig } from "../../../config/env.config";
import { logger } from "../../../config/logger";
import { NotificationProvider } from "../types";

const log = logger.child({ module: "notification-providers" });

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
