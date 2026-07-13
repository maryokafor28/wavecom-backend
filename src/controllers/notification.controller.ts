import { Request, Response } from "express";
import Notification from "../models/Notification.model";
import { queueService } from "../services/queue.service";
import {
  ICreateNotificationRequest,
  IQueueMessage,
  NotificationChannel,
} from "../types";
import { logger } from "../config/logger";

const log = logger.child({ module: "notification-controller" });

const VALID_CHANNELS: NotificationChannel[] = ["email", "sms", "push"];
const MAX_LIST_LIMIT = 100;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose E.164-ish check — tighten later if you adopt a proper phone validation lib.
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

function isValidRecipient(
  channel: NotificationChannel,
  recipient: string,
): boolean {
  if (channel === "email") return EMAIL_REGEX.test(recipient);
  if (channel === "sms") return PHONE_REGEX.test(recipient);
  return true; // push tokens vary too much in shape to validate generically here
}

class NotificationController {
  async createNotification(req: Request, res: Response): Promise<void> {
    try {
      const {
        recipient,
        message,
        channel,
        subject,
        metadata,
      }: ICreateNotificationRequest = req.body;

      if (!recipient || !message || !channel) {
        res.status(400).json({
          status: "error",
          message: "Missing required fields: recipient, message, channel",
        });
        return;
      }

      if (!VALID_CHANNELS.includes(channel)) {
        res.status(400).json({
          status: "error",
          message: "Invalid channel. Must be: email, sms, or push",
        });
        return;
      }

      if (!isValidRecipient(channel, recipient)) {
        res.status(400).json({
          status: "error",
          message: `Invalid recipient format for channel "${channel}"`,
        });
        return;
      }

      const notification = await Notification.create({
        recipient,
        message,
        channel,
        subject,
        metadata,
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
      });

      log.info({ notificationId: notification._id }, "Notification created");

      const queueMessage: IQueueMessage = {
        notificationId: notification._id.toString(),
        attempt: 1,
      };

      try {
        await queueService.publishToQueue(queueMessage);

        notification.status = "queued";
        await notification.save();
      } catch (publishError) {
        // The DB record exists but nothing will ever process it unless we
        // mark it failed here — otherwise it's orphaned in "pending" forever.
        log.error(
          { err: publishError, notificationId: notification._id },
          "Failed to publish notification to queue",
        );

        notification.status = "failed";
        notification.error = "Failed to queue notification for processing";
        await notification.save();

        res.status(502).json({
          status: "error",
          message:
            "Notification was created but could not be queued. Please retry.",
          data: { id: notification._id },
        });
        return;
      }

      res.status(201).json({
        status: "success",
        message: "Notification created and queued for processing",
        data: {
          id: notification._id,
          recipient: notification.recipient,
          channel: notification.channel,
          status: notification.status,
          createdAt: notification.createdAt,
        },
      });
    } catch (error) {
      log.error({ err: error }, "Error creating notification");
      res.status(500).json({
        status: "error",
        message: "Failed to create notification",
      });
    }
  }

  async getNotification(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const notification = await Notification.findById(id);

      if (!notification) {
        res.status(404).json({
          status: "error",
          message: "Notification not found",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        data: {
          id: notification._id,
          recipient: notification.recipient,
          message: notification.message,
          channel: notification.channel,
          subject: notification.subject,
          status: notification.status,
          attempts: notification.attempts,
          maxAttempts: notification.maxAttempts,
          lastAttemptAt: notification.lastAttemptAt,
          sentAt: notification.sentAt,
          failedAt: notification.failedAt,
          error: notification.error,
          metadata: notification.metadata,
          createdAt: notification.createdAt,
          updatedAt: notification.updatedAt,
        },
      });
    } catch (error) {
      log.error({ err: error }, "Error fetching notification");
      res.status(500).json({
        status: "error",
        message: "Failed to fetch notification",
      });
    }
  }

  async listNotifications(req: Request, res: Response): Promise<void> {
    try {
      const { status, channel, page = "1", limit = "20" } = req.query;

      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      if (channel) filter.channel = channel;

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(
        MAX_LIST_LIMIT,
        Math.max(1, parseInt(limit as string, 10) || 20),
      );
      const skip = (pageNum - 1) * limitNum;

      const totalCount = await Notification.countDocuments(filter);

      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      res.status(200).json({
        status: "success",
        data: {
          notifications: notifications.map((notif) => ({
            id: notif._id,
            recipient: notif.recipient,
            channel: notif.channel,
            status: notif.status,
            attempts: notif.attempts,
            createdAt: notif.createdAt,
            sentAt: notif.sentAt,
            failedAt: notif.failedAt,
          })),
          pagination: {
            total: totalCount,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(totalCount / limitNum),
          },
        },
      });
    } catch (error) {
      log.error({ err: error }, "Error listing notifications");
      res.status(500).json({
        status: "error",
        message: "Failed to list notifications",
      });
    }
  }

  async deleteNotification(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const notification = await Notification.findByIdAndDelete(id);

      if (!notification) {
        res.status(404).json({
          status: "error",
          message: "Notification not found",
        });
        return;
      }

      log.info({ notificationId: id }, "Notification deleted");

      res.status(200).json({
        status: "success",
        message: "Notification deleted successfully",
        data: {
          id: notification._id,
        },
      });
    } catch (error) {
      log.error({ err: error }, "Error deleting notification");
      res.status(500).json({
        status: "error",
        message: "Failed to delete notification",
      });
    }
  }
}

export const notificationController = new NotificationController();
