import amqp from "amqplib/callback_api";
import { envConfig } from "./env.config";

export const NOTIFICATION_QUEUE = "notifications";

class RabbitMQConnection {
  private connection: any = null;
  private channel: any = null;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      amqp.connect(envConfig.rabbitmqUri, (error, connection) => {
        if (error) {
          console.error("❌ Failed to connect to RabbitMQ:", error);
          reject(error);
          return;
        }

        this.connection = connection;
        console.log("✅ RabbitMQ connected successfully");

        connection.createChannel((channelError, channel) => {
          if (channelError) {
            console.error("❌ Failed to create channel:", channelError);
            reject(channelError);
            return;
          }

          this.channel = channel;
          console.log("✅ RabbitMQ channel created");

          channel.assertQueue(
            NOTIFICATION_QUEUE,
            { durable: true },
            (queueError) => {
              if (queueError) {
                console.error("❌ Failed to assert queue:", queueError);
                reject(queueError);
                return;
              }

              console.log(`✅ Queue '${NOTIFICATION_QUEUE}' is ready`);
              resolve();
            }
          );
        });

        connection.on("error", (err) => {
          console.error("❌ RabbitMQ connection error:", err);
        });

        connection.on("close", () => {
          console.log("⚠️  RabbitMQ connection closed");
        });
      });
    });
  }

  getChannel(): any {
    if (!this.channel) {
      throw new Error(
        "RabbitMQ channel not initialized. Call connect() first."
      );
    }
    return this.channel;
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (this.channel) {
          this.channel.close(() => {
            if (this.connection) {
              this.connection.close(() => {
                console.log("✅ RabbitMQ connection closed gracefully");
                resolve();
              });
            } else {
              resolve();
            }
          });
        } else if (this.connection) {
          this.connection.close(() => {
            console.log("✅ RabbitMQ connection closed gracefully");
            resolve();
          });
        } else {
          resolve();
        }
      } catch (error) {
        console.error("❌ Error closing RabbitMQ connection:", error);
        resolve();
      }
    });
  }
}

export const rabbitmqConnection = new RabbitMQConnection();
