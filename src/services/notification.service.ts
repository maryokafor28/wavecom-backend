import { HydratedDocument } from "mongoose";
import {
  NotificationChannel,
  ICreateNotificationRequest,
  INotification,
  IQueueMessage,
} from "../types";
import { logger } from "../config/logger";
import Notification from "../models/notification.model";
import { queueService } from "./queue.service";

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

  // --- Sending ---

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

  // --- CRUD / lifecycle (moved from the controller) ---

  async createAndQueue(data: ICreateNotificationRequest): Promise<{
    notification: HydratedDocument<INotification>;
    queueError: boolean;
  }> {
    const notification = await Notification.create({
      ...data,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
    });

    log.info({ notificationId: notification._id }, "Notification created");

    const queueMessage: IQueueMessage = {
      notificationId: notification._id.toString(),
      attempt: 1,
    };

    try {
      await queueService.publishToQueue(queueMessage);

      notification.status = "queued";
      await notification.save();

      return { notification, queueError: false };
    } catch (publishError) {
      // The DB record exists but nothing will ever process it unless we
      // mark it failed here — otherwise it's orphaned in "pending" forever.
      log.error(
        { err: publishError, notificationId: notification._id },
        "Failed to publish notification to queue",
      );

      notification.status = "failed";
      notification.error = "Failed to queue notification for processing";
      await notification.save();

      return { notification, queueError: true };
    }
  }

  async getById(id: string): Promise<HydratedDocument<INotification> | null> {
    return Notification.findById(id);
  }

  async list(
    filter: Record<string, unknown>,
    pageNum: number,
    limitNum: number,
  ): Promise<{
    notifications: HydratedDocument<INotification>[];
    totalCount: number;
  }> {
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    return { notifications, totalCount };
  }

  async deleteById(
    id: string,
  ): Promise<HydratedDocument<INotification> | null> {
    return Notification.findByIdAndDelete(id);
  }
}

export const notificationService = new NotificationService();
