import { Document } from "mongoose";

// Notification channels - using union type instead of enum
export type NotificationChannel = "email" | "sms" | "push";

// Notification status - using union type instead of enum
export type NotificationStatus =
  | "pending"
  | "queued"
  | "processing"
  | "sent"
  | "failed";

// Constants for easy access (if you need to list all values)
export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "email",
  "sms",
  "push",
];
export const NOTIFICATION_STATUSES: NotificationStatus[] = [
  "pending",
  "queued",
  "processing",
  "sent",
  "failed",
];

// Base notification data
export interface INotificationPayload {
  recipient: string;
  message: string;
  channel: NotificationChannel;
  subject?: string; // Optional, for emails
  metadata?: Record<string, any>; // Any additional data
}

// Notification document (what gets stored in MongoDB)
export interface INotification extends Document {
  recipient: string;
  message: string;
  channel: NotificationChannel;
  subject?: string;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  sentAt?: Date;
  failedAt?: Date;
  error?: string;
  metadata?: Record<string, any>;
  recipientId?: string | null;
  provider?: string | null;
  latency?: number | null;
  statusHistory: IStatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}
// Request body for creating notification
export interface ICreateNotificationRequest {
  recipient: string;
  message: string;
  channel: NotificationChannel;
  subject?: string;
  metadata?: Record<string, any>;
  recipientId?: string;
}

// Queue message structure
export interface IQueueMessage {
  notificationId: string;
  attempt: number;
}
// Recipient document (what gets stored in MongoDB)
export interface IRecipient extends Document {
  name: string;
  email: string;
  phone?: string;
  pushToken?: string;
  preferredChannel: NotificationChannel;
  createdAt: Date;
  updatedAt: Date;
}

// Request body for creating a recipient
export interface ICreateRecipientRequest {
  name: string;
  email: string;
  phone?: string;
  preferredChannel?: NotificationChannel;
}

// A single status transition, recorded for timeline/event-log display
export interface IStatusHistoryEntry {
  status: NotificationStatus;
  timestamp: Date;
  detail?: string; // e.g. "retry 2/3", or a real provider error snippet
}
