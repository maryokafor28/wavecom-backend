import { Request, Response } from "express";
import Notification from "../models/Notification.model";
import { queueService } from "../services/queue.service";
import { ICreateNotificationRequest, IQueueMessage } from "../types";

class NotificationController {
  // POST /api/notifications - Create new notification
  async createNotification(req: Request, res: Response): Promise<void> {
    try {
      const {
        recipient,
        message,
        channel,
        subject,
        metadata,
      }: ICreateNotificationRequest = req.body;

      // Validate required fields
      if (!recipient || !message || !channel) {
        res.status(400).json({
          status: "error",
          message: "Missing required fields: recipient, message, channel",
        });
        return;
      }

      // Validate channel type
      if (!["email", "sms", "push"].includes(channel)) {
        res.status(400).json({
          status: "error",
          message: "Invalid channel. Must be: email, sms, or push",
        });
        return;
      }

      // Create notification in database
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

      console.log(`✅ Notification created: ${notification._id}`);

      // Publish to queue for processing
      const queueMessage: IQueueMessage = {
        notificationId: notification._id.toString(),
        attempt: 1,
      };

      await queueService.publishToQueue(queueMessage);

      // Update status to queued
      notification.status = "queued";
      await notification.save();

      // Return response to client
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
    } catch (error: any) {
      console.error("❌ Error creating notification:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to create notification",
        error: error.message,
      });
    }
  }

  // GET /api/notifications/:id - Get single notification
  async getNotification(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Find notification by ID
      const notification = await Notification.findById(id);

      if (!notification) {
        res.status(404).json({
          status: "error",
          message: "Notification not found",
        });
        return;
      }

      // Return notification details
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
    } catch (error: any) {
      console.error("❌ Error fetching notification:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch notification",
        error: error.message,
      });
    }
  }

  // GET /api/notifications - List all notifications with filters
  async listNotifications(req: Request, res: Response): Promise<void> {
    try {
      const { status, channel, page = "1", limit = "20" } = req.query;

      // Build filter object
      const filter: any = {};

      if (status) {
        filter.status = status;
      }

      if (channel) {
        filter.channel = channel;
      }

      // Calculate pagination
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      // Get total count for pagination
      const totalCount = await Notification.countDocuments(filter);

      // Fetch notifications with pagination
      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limitNum);

      // Return list with pagination info
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
    } catch (error: any) {
      console.error("❌ Error listing notifications:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to list notifications",
        error: error.message,
      });
    }
  }
}

export const notificationController = new NotificationController();
