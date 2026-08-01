import { Request, Response } from "express";
import { logger } from "../config/logger";
import { queueMetricsService } from "../services/queue.metrics.service";

const log = logger.child({ module: "queue-controller" });

class QueueController {
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await queueMetricsService.getStats();

      res.status(200).json({
        status: "success",
        data: stats,
      });
    } catch (error) {
      log.error({ err: error }, "Error fetching queue stats");
      res.status(500).json({
        status: "error",
        message: "Failed to fetch queue stats",
      });
    }
  }
}

export const queueController = new QueueController();
