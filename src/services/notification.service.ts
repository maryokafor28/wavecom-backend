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
  SmsNotificationProvider,
} from "./providers/types";
import { ResendEmailProvider } from "./providers/email/resend.provider";
import {
  MockPushProvider,
  FirebasePushProvider,
} from "./providers/push/firebase.provider";
import {
  TwilioSmsProvider,
  MockSmsProvider,
} from "./providers/sms/twilioSms.provider";
import { envConfig } from "../config/env.config";

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

interface SendResult {
  success: boolean;
  error?: string;
}

class NotificationService {
  // Provider selection point — email/push stay on the original
  // boolean-returning NotificationProvider interface. SMS gets its own
  // provider + result type so a real failure reason (e.g. a Twilio trial
  // limitation) can be surfaced on the notification record.
  private providers: Record<"email" | "push", NotificationProvider> = {
    email: new ResendEmailProvider(),
    push: envConfig.useRealPush
      ? new FirebasePushProvider()
      : new MockPushProvider(),
  };

  private smsProvider: SmsNotificationProvider = envConfig.useRealSms
    ? new TwilioSmsProvider()
    : new MockSmsProvider();

  // --- Sending ---

  async send(
    channel: NotificationChannel,
    recipient: string,
    message: string,
    subject?: string,
  ): Promise<SendResult> {
    log.info({ channel, recipient }, "Sending notification");

    try {
      if (channel === "sms") {
        return await withTimeout(
          this.smsProvider.send(recipient, message),
          SEND_TIMEOUT_MS,
        );
      }

      const provider = this.providers[channel];

      if (!provider) {
        log.error({ channel }, "Unsupported notification channel");
        return {
          success: false,
          error: `Unsupported notification channel: ${channel}`,
        };
      }

      const success = await withTimeout(
        provider.send(recipient, message, subject),
        SEND_TIMEOUT_MS,
      );
      return { success };
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      log.error(
        { err: error, channel, recipient },
        "Error in notification provider",
      );
      return { success: false, error: errMessage };
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
