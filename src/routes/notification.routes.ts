import { Router } from "express";
import { notificationController } from "../controllers/notification.controller";

const router = Router();

// POST /api/notifications - Create new notification
router.post("/", (req, res) =>
  notificationController.createNotification(req, res)
);

// GET /api/notifications/:id - Get single notification
router.get("/:id", (req, res) =>
  notificationController.getNotification(req, res)
);

// GET /api/notifications - List all notifications
router.get("/", (req, res) =>
  notificationController.listNotifications(req, res)
);

export default router;
