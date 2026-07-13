import amqp, { Channel, ChannelModel } from "amqplib";
import { envConfig } from "./env.config";
import { logger } from "./logger";

export const NOTIFICATION_QUEUE = "notifications";
export const NOTIFICATION_DLQ = "notifications.dlq";
export const DLX_EXCHANGE = "notifications.dlx";

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000; // 1s, doubles each attempt: 1s, 2s, 4s, 8s, 16s...
const MAX_DELAY_MS = 30000; // cap so late retries don't wait forever

const log = logger.child({ module: "rabbitmq" });

class RabbitMQConnection {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private isReconnecting = false;
  private isShuttingDown = false;

  async connect(retries = MAX_RETRIES): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.connection = await amqp.connect(envConfig.rabbitmqUrl);

        this.connection.on("error", (error: Error) => {
          log.error({ err: error }, "RabbitMQ connection error");
        });

        this.connection.on("close", () => {
          log.warn("RabbitMQ connection closed");
          this.connection = null;
          this.channel = null;

          if (!this.isShuttingDown) {
            this.scheduleReconnect();
          }
        });

        this.channel = await this.connection.createChannel();

        this.channel.on("error", (error: Error) => {
          log.error({ err: error }, "RabbitMQ channel error");
        });

        this.channel.on("close", () => {
          log.warn("RabbitMQ channel closed");
        });

        // Dead letter exchange + queue: messages that are nacked/rejected
        // (requeue: false) or that expire land here instead of vanishing.
        await this.channel.assertExchange(DLX_EXCHANGE, "fanout", {
          durable: true,
        });

        await this.channel.assertQueue(NOTIFICATION_DLQ, {
          durable: true,
        });

        await this.channel.bindQueue(NOTIFICATION_DLQ, DLX_EXCHANGE, "");

        // Main queue, routes dead-lettered messages to the DLX above.
        await this.channel.assertQueue(NOTIFICATION_QUEUE, {
          durable: true,
          arguments: {
            "x-dead-letter-exchange": DLX_EXCHANGE,
          },
        });

        log.info("RabbitMQ connected successfully");
        log.info({ queue: NOTIFICATION_QUEUE }, "Notification queue is ready");
        log.info({ queue: NOTIFICATION_DLQ }, "Dead-letter queue is ready");

        this.isReconnecting = false;
        return;
      } catch (error) {
        log.error(
          { err: error, attempt, retries },
          "RabbitMQ connect attempt failed",
        );

        if (attempt === retries) {
          log.error("Failed to connect to RabbitMQ after all retries");
          throw error;
        }

        const delay = Math.min(
          BASE_DELAY_MS * 2 ** (attempt - 1),
          MAX_DELAY_MS,
        );
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    log.info("Attempting to reconnect to RabbitMQ...");
    this.connect().catch((error) => {
      log.error(
        { err: error },
        "Reconnection attempts exhausted. Manual intervention may be required.",
      );
      this.isReconnecting = false;
    });
  }

  getChannel(): Channel {
    if (!this.channel) {
      throw new Error(
        "RabbitMQ channel has not been initialized. Call connect() first.",
      );
    }

    return this.channel;
  }

  async close(): Promise<void> {
    this.isShuttingDown = true;

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      log.info("RabbitMQ connection closed");
    } catch (error) {
      log.error({ err: error }, "Error while closing RabbitMQ");
      throw error;
    }
  }
}

export const rabbitmqConnection = new RabbitMQConnection();
