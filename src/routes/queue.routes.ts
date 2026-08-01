import { Router } from "express";
import { queueController } from "../controllers/queue.controller";
console.log(">>> queue.routes.ts was loaded <<<");

const router = Router();

// GET /api/queue/stats - Live RabbitMQ queue depth, processing, and dead-letter counts
router.get("/stats", (req, res) => queueController.getStats(req, res));

export default router;
