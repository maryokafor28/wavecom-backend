import { Router } from "express";
import { recipientController } from "../controllers/recipient.controller";

const router = Router();

// POST /api/recipients - Create new recipient (triggers welcome email)
router.post("/", (req, res) => recipientController.createRecipient(req, res));

// GET /api/recipients/:id - Get single recipient
router.get("/:id", (req, res) => recipientController.getRecipient(req, res));

// GET /api/recipients - List all recipients
router.get("/", (req, res) => recipientController.listRecipients(req, res));

// DELETE /api/recipients/:id - Delete recipient by id
router.delete("/:id", (req, res) =>
  recipientController.deleteRecipient(req, res),
);
// PATCH /api/recipients/:id/push-token - Register/update FCM device token
router.patch("/:id/push-token", (req, res) =>
  recipientController.updatePushToken(req, res),
);

export default router;
