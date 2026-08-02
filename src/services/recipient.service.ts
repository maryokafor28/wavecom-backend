import { HydratedDocument } from "mongoose";
import { ICreateRecipientRequest, IRecipient } from "../types";
import { logger } from "../config/logger";
import Recipient from "../models/recipient.model";
import { notificationService } from "./notification.service";

const log = logger.child({ module: "recipient-service" });

function buildWelcomeEmailBody(name: string): string {
  return `Hello ${name},

Welcome to WaveCom Notifications.

Your recipient profile has been created successfully.
You can now receive real-time notifications through this platform.

Thanks,
WaveCom Team`;
}

class RecipientService {
  async createAndWelcome(
    data: ICreateRecipientRequest,
  ): Promise<HydratedDocument<IRecipient>> {
    const recipient = await Recipient.create({
      ...data,
      preferredChannel: data.preferredChannel ?? "email",
    });

    log.info({ recipientId: recipient._id }, "Recipient created");

    // Reuses the existing notification pipeline — no separate event system.
    // The welcome email flows through the same queue/worker/provider path
    // as every other notification.
    const { queueError } = await notificationService.createAndQueue({
      recipient: recipient.email,
      channel: "email",
      subject: "Welcome to WaveCom",
      message: buildWelcomeEmailBody(recipient.name),
      metadata: { recipientId: recipient._id.toString() },
    });

    if (queueError) {
      log.warn(
        { recipientId: recipient._id },
        "Recipient created but welcome email failed to queue",
      );
    }

    return recipient;
  }

  async getById(id: string): Promise<HydratedDocument<IRecipient> | null> {
    return Recipient.findById(id);
  }

  async list(): Promise<HydratedDocument<IRecipient>[]> {
    return Recipient.find().sort({ createdAt: -1 });
  }

  async deleteById(id: string): Promise<HydratedDocument<IRecipient> | null> {
    return Recipient.findByIdAndDelete(id);
  }

  async updatePushToken(
    id: string,
    pushToken: string,
  ): Promise<HydratedDocument<IRecipient> | null> {
    return Recipient.findByIdAndUpdate(
      id,
      { pushToken },
      { new: true }, // return the updated document, not the pre-update one
    );
  }
}

export const recipientService = new RecipientService();
