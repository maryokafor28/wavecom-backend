import { Request, Response } from "express";
import { logger } from "../config/logger";
import { notificationStatsService } from "../services/notification.stats.service";

const log = logger.child({ module: "notification-stats-controller" });

class NotificationStatsController {
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { recipientId } = req.query;
      const stats = await notificationStatsService.getStats(
        recipientId as string | undefined,
      );

      res.status(200).json({ status: "success", data: stats });
    } catch (error) {
      log.error({ err: error }, "Error fetching notification stats");
      res.status(500).json({
        status: "error",
        message: "Failed to fetch notification stats",
      });
    }
  }

  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { recipientId } = req.query;
      const analytics = await notificationStatsService.getAnalytics(
        recipientId as string | undefined,
      );

      res.status(200).json({ status: "success", data: analytics });
    } catch (error) {
      log.error({ err: error }, "Error fetching notification analytics");
      res.status(500).json({
        status: "error",
        message: "Failed to fetch notification analytics",
      });
    }
  }
}

export const notificationStatsController = new NotificationStatsController();
