import { Message } from "amqplib";
import {
  rabbitmqConnection,
  NOTIFICATION_QUEUE,
} from "../config/rabbitmq.config";
import { IQueueMessage } from "../types";
import { logger } from "../config/logger";

const MAX_MESSAGE_RETRIES = 3;

const log = logger.child({ module: "queue-service" });

class QueueService {
  // Publish a message to the queue
  async publishToQueue(message: IQueueMessage): Promise<boolean> {
    try {
      const channel = rabbitmqConnection.getChannel();

      const messageBuffer = Buffer.from(JSON.stringify(message));

      const published = channel.sendToQueue(NOTIFICATION_QUEUE, messageBuffer, {
        persistent: true, // Message survives RabbitMQ restart
      });

      if (published) {
        log.info(
          {
            notificationId: message.notificationId,
            attempt: message.attempt,
          },
          "Message published to queue",
        );
      } else {
        log.warn(
          {
            notificationId: message.notificationId,
            attempt: message.attempt,
          },
          "RabbitMQ write buffer is full. Message will be flushed when the drain event is emitted.",
        );
      }

      return published;
    } catch (error) {
      log.error({ err: error }, "Failed to publish message to queue");
      throw error;
    }
  }

  // Consume messages from the queue
  async consumeFromQueue(
    onMessage: (message: IQueueMessage) => Promise<void>,
  ): Promise<void> {
    try {
      const channel = rabbitmqConnection.getChannel();

      log.info({ queue: NOTIFICATION_QUEUE }, "Waiting for messages");

      // Allow each worker to process up to 10 unacknowledged messages
      // concurrently for better throughput.
      channel.prefetch(10);

      channel.consume(
        NOTIFICATION_QUEUE,
        async (msg: Message | null) => {
          if (!msg) return;

          const retryCount =
            (msg.properties.headers?.["x-retry-count"] as number) ?? 0;

          try {
            const queueMessage: IQueueMessage = JSON.parse(
              msg.content.toString(),
            );

            log.info(
              {
                notificationId: queueMessage.notificationId,
                attempt: queueMessage.attempt,
              },
              "Received message",
            );

            await onMessage(queueMessage);

            channel.ack(msg);

            log.info(
              {
                notificationId: queueMessage.notificationId,
              },
              "Message acknowledged",
            );
          } catch (error) {
            log.error({ err: error, retryCount }, "Error processing message");

            if (retryCount >= MAX_MESSAGE_RETRIES) {
              channel.nack(msg, false, false);

              log.warn(
                { retryCount },
                "Max retries exceeded. Message moved to dead-letter queue.",
              );
            } else {
              channel.nack(msg, false, false);

              channel.sendToQueue(NOTIFICATION_QUEUE, msg.content, {
                persistent: true,
                headers: {
                  ...msg.properties.headers,
                  "x-retry-count": retryCount + 1,
                },
              });

              log.info(
                { retryCount: retryCount + 1 },
                "Message requeued for retry",
              );
            }
          }
        },
        {
          noAck: false,
        },
      );
    } catch (error) {
      log.error({ err: error }, "Failed to consume from queue");
      throw error;
    }
  }
}

export const queueService = new QueueService();
