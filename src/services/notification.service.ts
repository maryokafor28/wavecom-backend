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
import {
  NotificationProvider,
  MockSmsProvider,
  MockPushProvider,
  ResendEmailProvider,
} from "./providers/notification.providers";

const log = logger.child({ module: "notification-service" });

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
    email: new ResendEmailProvider(),
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
