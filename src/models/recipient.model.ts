import mongoose, { Schema, Model } from "mongoose";
import {
  IRecipient,
  NotificationChannel,
  NOTIFICATION_CHANNELS,
} from "../types";

const RecipientSchema = new Schema<IRecipient>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [200, "Name exceeds maximum length"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: [320, "Email exceeds maximum length"],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, "Phone exceeds maximum length"],
    },
    pushToken: {
      type: String,
      trim: true,
      maxlength: [500, "Push token exceeds maximum length"],
    },
    preferredChannel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      default: "email" as NotificationChannel,
    },
  },
  {
    timestamps: true,
  },
);

RecipientSchema.index({ email: 1 });

const Recipient: Model<IRecipient> = mongoose.model<IRecipient>(
  "Recipient",
  RecipientSchema,
);

export default Recipient;
