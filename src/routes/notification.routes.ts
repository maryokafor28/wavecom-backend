import { Router } from "express";
import { notificationController } from "../controllers/notification.controller";
import { notificationStatsController } from "../controllers/notification.stats.controller";

const router = Router();

// GET /api/notifications/stats - Dashboard summary stats (optional ?recipientId=)
router.get("/stats", (req, res) =>
  notificationStatsController.getStats(req, res),
);

// GET /api/notifications/analytics - Charts data (optional ?recipientId=)
router.get("/analytics", (req, res) =>
  notificationStatsController.getAnalytics(req, res),
);

// POST /api/notifications - Create new notification
router.post("/", (req, res) =>
  notificationController.createNotification(req, res),
);

// GET /api/notifications/:id - Get single notification
router.get("/:id", (req, res) =>
  notificationController.getNotification(req, res),
);

// GET /api/notifications - List all notifications
router.get("/", (req, res) =>
  notificationController.listNotifications(req, res),
);

//delete notifcation by id
router.delete("/:id", (req, res) =>
  notificationController.deleteNotification(req, res),
);

export default router;
