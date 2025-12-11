import { connectDatabase } from "../config/database.config";
import { rabbitmqConnection } from "../config/rabbitmq.config";
import { queueService } from "../services/queue.service";
import { notificationService } from "../services/notification.service";
import { IQueueMessage } from "../types/index";

const testServices = async () => {
  try {
    // Connect to dependencies
    await connectDatabase();
    await rabbitmqConnection.connect();

    console.log("\n=== Testing Queue Service ===\n");

    // Test 1: Publish a message
    const testMessage: IQueueMessage = {
      notificationId: "test-123",
      attempt: 1,
    };

    await queueService.publishToQueue(testMessage);
    console.log("✅ Message published successfully");

    // Test 2: Test notification service
    console.log("\n=== Testing Notification Service ===\n");

    await notificationService.send(
      "email",
      "test@example.com",
      "Test email message",
      "Test Subject"
    );
    await notificationService.send("sms", "+1234567890", "Test SMS message");
    await notificationService.send(
      "push",
      "device-token-123",
      "Test push message"
    );

    console.log("\n🎉 All service tests completed!");

    // Close connections
    await rabbitmqConnection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
};

testServices();
