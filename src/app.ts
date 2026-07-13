import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import notificationRoutes from "./routes/notification.routes";
import { envConfig } from "./config/env.config";
import { logger } from "./config/logger";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware";

const app: Application = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: envConfig.corsOrigin,
  }),
);

// Body parsing
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Structured request logging — one line per request with method, path,
// status, and duration, using the same Pino instance as the rest of the app.
app.use(pinoHttp({ logger }));

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "WaveCom Notification System is running",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/notifications", notificationRoutes);

// 404 handler — after all real routes
app.use(notFoundHandler);

// Global error handler — must be last
app.use(errorHandler);

export default app;
