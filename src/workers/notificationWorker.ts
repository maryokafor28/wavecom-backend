import { connectDatabase } from "../config/database.config";
import { rabbitmqConnection } from "../config/rabbitmq.config";
import { queueService } from "../services/queue.service";
import { notificationService } from "../services/notification.service";
import Notification from "../models/Notification.model";
import { IQueueMessage } from "../types";

class NotificationWorker {
  // Process a single notification message
  async processNotification(queueMessage: IQueueMessage): Promise<void> {
    const { notificationId, attempt } = queueMessage;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing notification: ${notificationId}`);
    console.log(`Attempt: ${attempt}`);
    console.log("=".repeat(60));

    try {
      // Find notification in database
      const notification = await Notification.findById(notificationId);

      if (!notification) {
        console.error(`Notification not found: ${notificationId}`);
        return;
      }

      // Check if already processed
      if (notification.status === "sent") {
        console.log(`Notification already sent, skipping`);
        return;
      }

      // Update status to processing
      notification.status = "processing";
      notification.attempts = attempt;
      notification.lastAttemptAt = new Date();
      await notification.save();

      console.log(
        `Attempting to send ${notification.channel} notification to ${notification.recipient}`
      );

      // Send notification using the appropriate provider
      const success = await notificationService.send(
        notification.channel,
        notification.recipient,
        notification.message,
        notification.subject
      );

      if (success) {
        // Success - update notification status
        notification.status = "sent";
        notification.sentAt = new Date();
        await notification.save();

        console.log(`Notification sent successfully!`);
        console.log(`Recipient: ${notification.recipient}`);
        console.log(`Channel: ${notification.channel}`);
      } else {
        // Failed - handle retry logic
        await this.handleFailure(notification, attempt);
      }
    } catch (error: any) {
      console.error(`❌ Error processing notification:`, error.message);

      // Try to update notification with error
      try {
        const notification = await Notification.findById(notificationId);
        if (notification) {
          await this.handleFailure(notification, attempt, error.message);
        }
      } catch (updateError) {
        console.error(
          `❌ Failed to update notification after error:`,
          updateError
        );
      }
    }
  }

  // Handle notification failure and retry logic
  private async handleFailure(
    notification: any,
    attempt: number,
    errorMessage?: string
  ): Promise<void> {
    console.log(`Notification failed on attempt ${attempt}`);

    // Check if we should retry
    if (attempt < notification.maxAttempts) {
      // Requeue for retry
      const nextAttempt = attempt + 1;

      console.log(
        `Requeuing for retry (attempt ${nextAttempt}/${notification.maxAttempts})`
      );

      // Calculate delay before retry (exponential backoff)
      const delaySeconds = Math.pow(2, attempt) * 5; // 5s, 10s, 20s, 40s...
      console.log(`Next retry in ${delaySeconds} seconds`);

      // Wait before requeuing
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));

      // Publish back to queue
      const retryMessage: IQueueMessage = {
        notificationId: notification._id.toString(),
        attempt: nextAttempt,
      };

      await queueService.publishToQueue(retryMessage);

      // Update notification
      notification.status = "queued";
      notification.error = errorMessage || "Provider returned failure";
      await notification.save();
    } else {
      // Max retries reached - mark as failed
      console.log(
        `Max retries reached (${notification.maxAttempts}), marking as failed`
      );

      notification.status = "failed";
      notification.failedAt = new Date();
      notification.error =
        errorMessage || `Failed after ${notification.maxAttempts} attempts`;
      await notification.save();
    }
  }

  // Start the worker
  async start(): Promise<void> {
    try {
      console.log("Starting Notification Worker...\n");

      // Connect to database
      await connectDatabase();

      // Connect to RabbitMQ
      await rabbitmqConnection.connect();

      console.log("Worker ready to process notifications\n");

      // Start consuming messages
      await queueService.consumeFromQueue(async (message: IQueueMessage) => {
        await this.processNotification(message);
      });
    } catch (error) {
      console.error("❌ Failed to start worker:", error);
      process.exit(1);
    }
  }
}

// Create and start worker
const worker = new NotificationWorker();
worker.start();

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log("\n Worker shutting down gracefully...");

  try {
    await rabbitmqConnection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
