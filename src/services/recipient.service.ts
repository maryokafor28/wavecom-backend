import { HydratedDocument } from "mongoose";
import { ICreateRecipientRequest, IRecipient } from "../types";
import { logger } from "../config/logger";
import Recipient from "../models/recipient.model";
import { notificationService } from "./notification.service";
import { NotificationChannel } from "../types";

const log = logger.child({ module: "recipient-service" });

export interface IUpdateRecipientInput {
  name?: string;
  phone?: string | null; // null clears the phone number
  preferredChannel?: NotificationChannel;
}

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

  async list(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [recipients, total] = await Promise.all([
      Recipient.find().sort({ createdAt: -1 }).skip(skip).limit(limit),

      Recipient.countDocuments(),
    ]);

    return {
      recipients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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

  async update(
    id: string,
    input: IUpdateRecipientInput,
  ): Promise<HydratedDocument<IRecipient> | null> {
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};

    if (input.name !== undefined) set.name = input.name;
    if (input.preferredChannel !== undefined) {
      set.preferredChannel = input.preferredChannel;
    }
    if (input.phone !== undefined) {
      if (input.phone === null) unset.phone = 1;
      else set.phone = input.phone;
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    return Recipient.findByIdAndUpdate(id, update, {
      new: true, // return the updated document
      runValidators: true, // enforce the schema's maxlength/enum rules on update
    });
  }
}

export const recipientService = new RecipientService();
