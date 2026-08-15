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
  async findOrCreateAndWelcome(
    data: ICreateRecipientRequest,
  ): Promise<{ recipient: HydratedDocument<IRecipient>; isNew: boolean }> {
    const email = data.email.toLowerCase().trim();

    const existing = await Recipient.findOne({ email });
    if (existing) {
      log.info(
        { recipientId: existing._id },
        "Recipient already exists — returning existing record, no welcome email sent",
      );
      return { recipient: existing, isNew: false };
    }

    try {
      const recipient = await Recipient.create({
        ...data,
        preferredChannel: data.preferredChannel ?? "email",
      });

      log.info({ recipientId: recipient._id }, "Recipient created");

      // Reuses the existing notification pipeline — no separate event system.
      const { queueError } = await notificationService.createAndQueue({
        recipient: recipient.email,
        channel: "email",
        subject: "Welcome to WaveCom",
        message: buildWelcomeEmailBody(recipient.name),
        recipientId: recipient._id.toString(),
      });

      if (queueError) {
        log.warn(
          { recipientId: recipient._id },
          "Recipient created but welcome email failed to queue",
        );
      }

      return { recipient, isNew: true };
    } catch (error: any) {
      // Race condition: another request created this email between our
      // lookup above and this insert. Fetch and return the winner instead
      // of erroring — the outcome the caller cares about (a real recipient
      // exists for this email) is still satisfied.
      if (error.code === 11000) {
        const winner = await Recipient.findOne({ email });
        if (winner) {
          log.info(
            { recipientId: winner._id },
            "Race on recipient creation — returning the record that won",
          );
          return { recipient: winner, isNew: false };
        }
      }
      throw error;
    }
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
