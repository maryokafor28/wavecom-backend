import { logger } from "../../../config/logger";
import { NotificationProvider } from "../types";

const log = logger.child({ module: "notification-providers" });

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
