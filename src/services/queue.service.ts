import {
  rabbitmqConnection,
  NOTIFICATION_QUEUE,
} from "../config/rabbitmq.config";
import { IQueueMessage } from "../types";

class QueueService {
  // Publish a message to the queue
  async publishToQueue(message: IQueueMessage): Promise<boolean> {
    try {
      const channel = rabbitmqConnection.getChannel();

      // Convert message object to Buffer (RabbitMQ needs binary data)
      const messageBuffer = Buffer.from(JSON.stringify(message));

      // Send message to queue
      const published = channel.sendToQueue(NOTIFICATION_QUEUE, messageBuffer, {
        persistent: true, // Message survives RabbitMQ restart
      });

      if (published) {
        console.log(`📤 Message published to queue:`, message);
        return true;
      } else {
        console.warn("⚠️  Queue is full, message not published");
        return false;
      }
    } catch (error) {
      console.error("❌ Failed to publish message to queue:", error);
      throw error;
    }
  }

  // Consume messages from the queue (will be used by worker)
  async consumeFromQueue(
    onMessage: (message: IQueueMessage) => Promise<void>
  ): Promise<void> {
    try {
      const channel = rabbitmqConnection.getChannel();

      console.log(`👂 Waiting for messages in queue: ${NOTIFICATION_QUEUE}`);

      // Set prefetch to 1 - process one message at a time
      channel.prefetch(1);

      // Start consuming messages
      channel.consume(
        NOTIFICATION_QUEUE,
        async (msg: any) => {
          if (msg === null) {
            return;
          }

          try {
            // Parse message content
            const messageContent = msg.content.toString();
            const queueMessage: IQueueMessage = JSON.parse(messageContent);

            console.log(`📥 Received message:`, queueMessage);

            // Process the message (call the handler function)
            await onMessage(queueMessage);

            // Acknowledge message (remove from queue)
            channel.ack(msg);
            console.log(`✅ Message acknowledged`);
          } catch (error) {
            console.error("❌ Error processing message:", error);

            // Reject message and requeue it (will be retried)
            channel.nack(msg, false, true);
            console.log(`🔄 Message requeued for retry`);
          }
        },
        {
          noAck: false, // Manual acknowledgment (important for reliability)
        }
      );
    } catch (error) {
      console.error("❌ Failed to consume from queue:", error);
      throw error;
    }
  }
}

export const queueService = new QueueService();
