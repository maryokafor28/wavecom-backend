import { HydratedDocument } from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/database.config";
import { rabbitmqConnection } from "../config/rabbitmq.config";
import { queueService } from "../services/queue.service";
import { notificationService } from "../services/notification.service";
import Notification from "../models/Notification.model";
import { IQueueMessage, INotification } from "../types";
import { logger } from "../config/logger";

const log = logger.child({ module: "notification-worker" });

class NotificationWorker {
  async processNotification(queueMessage: IQueueMessage): Promise<void> {
    const { notificationId, attempt } = queueMessage;

    log.info({ notificationId, attempt }, "Processing notification");

    try {
      const notification = await Notification.findById(notificationId);

      if (!notification) {
        log.error({ notificationId }, "Notification not found");
        return;
      }

      if (notification.status === "sent") {
        log.info({ notificationId }, "Notification already sent, skipping");
        return;
      }

      notification.status = "processing";
      notification.attempts = attempt;
      notification.lastAttemptAt = new Date();
      await notification.save();

      log.info(
        {
          notificationId,
          channel: notification.channel,
          recipient: notification.recipient,
        },
        "Attempting to send notification",
      );

      const success = await notificationService.send(
        notification.channel,
        notification.recipient,
        notification.message,
        notification.subject,
      );

      if (success) {
        notification.status = "sent";
        notification.sentAt = new Date();
        await notification.save();

        log.info(
          {
            notificationId,
            channel: notification.channel,
            recipient: notification.recipient,
          },
          "Notification sent successfully",
        );
      } else {
        await this.safeHandleFailure(notification, attempt);
      }
    } catch (error) {
      const err = error as Error;
      log.error({ err, notificationId }, "Error processing notification");

      try {
        const notification = await Notification.findById(notificationId);
        if (notification) {
          await this.safeHandleFailure(notification, attempt, err.message);
        }
      } catch (updateError) {
        log.error(
          { err: updateError, notificationId },
          "Failed to update notification after error",
        );
      }
    }
  }

  // Wraps handleFailure so a failure inside it (e.g. publish error) can't
  // propagate back out and trigger a second, duplicate handleFailure call
  // from processNotification's outer catch block.
  private async safeHandleFailure(
    notification: HydratedDocument<INotification>,
    attempt: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.handleFailure(notification, attempt, errorMessage);
    } catch (error) {
      log.error(
        { err: error, notificationId: notification._id },
        "Failed to handle notification failure (retry/DLQ path)",
      );
    }
  }

  private async handleFailure(
    notification: HydratedDocument<INotification>,
    attempt: number,
    errorMessage?: string,
  ): Promise<void> {
    log.warn(
      { notificationId: notification._id, attempt },
      "Notification failed",
    );

    if (attempt < notification.maxAttempts) {
      const nextAttempt = attempt + 1;
      const delaySeconds = Math.pow(2, attempt) * 5; // 5s, 10s, 20s, 40s...

      log.info(
        {
          notificationId: notification._id,
          nextAttempt,
          maxAttempts: notification.maxAttempts,
          delaySeconds,
        },
        "Requeuing for retry",
      );

      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));

      const retryMessage: IQueueMessage = {
        notificationId: notification._id.toString(),
        attempt: nextAttempt,
      };

      await queueService.publishToQueue(retryMessage);

      notification.status = "queued";
      notification.error = errorMessage || "Provider returned failure";
      await notification.save();
    } else {
      log.warn(
        {
          notificationId: notification._id,
          maxAttempts: notification.maxAttempts,
        },
        "Max retries reached, marking as failed",
      );

      notification.status = "failed";
      notification.failedAt = new Date();
      notification.error =
        errorMessage || `Failed after ${notification.maxAttempts} attempts`;
      await notification.save();
    }
  }

  async start(): Promise<void> {
    try {
      log.info("Starting Notification Worker");

      await connectDatabase();
      await rabbitmqConnection.connect();

      log.info("Worker ready to process notifications");

      await queueService.consumeFromQueue(async (message: IQueueMessage) => {
        await this.processNotification(message);
      });
    } catch (error) {
      log.error({ err: error }, "Failed to start worker");
      process.exit(1);
    }
  }
}

const worker = new NotificationWorker();
worker.start();

const gracefulShutdown = async (): Promise<void> => {
  log.info("Worker shutting down gracefully");

  try {
    await rabbitmqConnection.close();
    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    log.error({ err: error }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
