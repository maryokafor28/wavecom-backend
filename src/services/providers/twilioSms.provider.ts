import twilio from "twilio";
import { envConfig } from "../../config/env.config";
import { logger } from "../../config/logger";
import {
  SmsNotificationProvider,
  SmsSendResult,
} from "./notification.providers";

const log = logger.child({ module: "twilio-sms-provider" });

const twilioClient = twilio(
  envConfig.twilioAccountSid,
  envConfig.twilioAuthToken,
);

export class TwilioSmsProvider implements SmsNotificationProvider {
  async send(recipient: string, message: string): Promise<SmsSendResult> {
    try {
      const result = await twilioClient.messages.create({
        from: envConfig.twilioPhoneNumber,
        to: recipient,
        body: message,
      });

      log.info(
        { recipient, sid: result.sid, status: result.status },
        "SMS sent (Twilio)",
      );
      return { success: true };
    } catch (error) {
      const twilioMessage =
        error instanceof Error ? error.message : String(error);
      log.error(
        { err: error, recipient, provider: "twilio" },
        `Twilio provider error: ${twilioMessage}`,
      );
      return { success: false, error: `Twilio: ${twilioMessage}` };
    }
  }
}
