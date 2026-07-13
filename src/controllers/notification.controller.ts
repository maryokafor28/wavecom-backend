import { Request, Response } from "express";
import { ICreateNotificationRequest } from "../types";
import { logger } from "../config/logger";
import { notificationService } from "../services/notification.service";
import {
  isValidChannel,
  isValidRecipient,
  parsePagination,
} from "../validators/notification.validator";

const log = logger.child({ module: "notification-controller" });

class NotificationController {
  async createNotification(req: Request, res: Response): Promise<void> {
    try {
      const body: ICreateNotificationRequest = req.body;
      const { recipient, message, channel } = body;

      if (!recipient || !message || !channel) {
        res.status(400).json({
          status: "error",
          message: "Missing required fields: recipient, message, channel",
        });
        return;
      }

      if (!isValidChannel(channel)) {
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

      const { notification, queueError } =
        await notificationService.createAndQueue(body);

      if (queueError) {
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
      const notification = await notificationService.getById(id);

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

      const { pageNum, limitNum } = parsePagination(page, limit);

      const { notifications, totalCount } = await notificationService.list(
        filter,
        pageNum,
        limitNum,
      );

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
      const notification = await notificationService.deleteById(id);

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
