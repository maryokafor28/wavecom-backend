import { NotificationChannel } from "../types";

// Mock providers simulate actual notification sending
class NotificationService {
  // Mock Email Provider
  private async sendEmail(
    recipient: string,
    subject: string,
    message: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Simulate network delay (200-500ms)
      const delay = Math.random() * 300 + 200;

      setTimeout(() => {
        // Simulate 90% success rate
        const success = Math.random() > 0.1;

        if (success) {
          console.log(`📧 Email sent to ${recipient}`);
          console.log(`   Subject: ${subject}`);
          console.log(`   Message: ${message.substring(0, 50)}...`);
        } else {
          console.log(`❌ Email failed to ${recipient}`);
        }

        resolve(success);
      }, delay);
    });
  }

  // Mock SMS Provider
  private async sendSMS(recipient: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Simulate network delay (100-300ms)
      const delay = Math.random() * 200 + 100;

      setTimeout(() => {
        // Simulate 85% success rate
        const success = Math.random() > 0.15;

        if (success) {
          console.log(`📱 SMS sent to ${recipient}`);
          console.log(`   Message: ${message.substring(0, 50)}...`);
        } else {
          console.log(`❌ SMS failed to ${recipient}`);
        }

        resolve(success);
      }, delay);
    });
  }

  // Mock Push Notification Provider
  private async sendPush(recipient: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Simulate network delay (50-150ms)
      const delay = Math.random() * 100 + 50;

      setTimeout(() => {
        // Simulate 95% success rate (push is most reliable)
        const success = Math.random() > 0.05;

        if (success) {
          console.log(`🔔 Push notification sent to ${recipient}`);
          console.log(`   Message: ${message.substring(0, 50)}...`);
        } else {
          console.log(`❌ Push failed to ${recipient}`);
        }

        resolve(success);
      }, delay);
    });
  }

  // Main send method - routes to correct provider
  async send(
    channel: NotificationChannel,
    recipient: string,
    message: string,
    subject?: string
  ): Promise<boolean> {
    console.log(`\n🚀 Sending ${channel} notification...`);

    try {
      let success = false;

      switch (channel) {
        case "email":
          success = await this.sendEmail(
            recipient,
            subject || "Notification",
            message
          );
          break;

        case "sms":
          success = await this.sendSMS(recipient, message);
          break;

        case "push":
          success = await this.sendPush(recipient, message);
          break;

        default:
          throw new Error(`Unsupported channel: ${channel}`);
      }

      return success;
    } catch (error) {
      console.error(`❌ Error in ${channel} provider:`, error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
