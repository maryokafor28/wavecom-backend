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
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },
    channel: {
      type: String,
      enum: NOTIFICATION_CHANNELS, // Use the constant array
      required: [true, "Channel is required"],
    },
    subject: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES, // Use the constant array
      default: "pending" as NotificationStatus,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
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
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
NotificationSchema.index({ status: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1 });
NotificationSchema.index({ channel: 1, status: 1 });

// Model
const Notification: Model<INotification> = mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);

export default Notification;
