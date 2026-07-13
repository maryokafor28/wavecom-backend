import mongoose, { Schema, Model } from "mongoose";
import {
  INotification,
  NotificationChannel,
  NotificationStatus,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
} from "../types";

const NotificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: String,
      required: [true, "Recipient is required"],
      trim: true,
      maxlength: [320, "Recipient exceeds maximum length"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [5000, "Message exceeds maximum length"],
    },
    channel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      required: [true, "Channel is required"],
    },
    subject: {
      type: String,
      trim: true,
      maxlength: [200, "Subject exceeds maximum length"],
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: "pending" as NotificationStatus,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
    },
    lastAttemptAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    error: {
      type: String,
      maxlength: [1000, "Error message exceeds maximum length"],
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

NotificationSchema.index({ status: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1 });
NotificationSchema.index({ channel: 1, status: 1 });

const Notification: Model<INotification> = mongoose.model<INotification>(
  "Notification",
  NotificationSchema,
);

export default Notification;
