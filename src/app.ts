import express, { Application, Request, Response } from "express";
import cors from "cors";
import notificationRoutes from "./routes/notification.routes";

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

export default app;
