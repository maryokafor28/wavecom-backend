import type { Server } from "http";

import app from "./app";
import { envConfig } from "./config/env.config";
import { connectDatabase, disconnectDatabase } from "./config/database.config";
import { rabbitmqConnection } from "./config/rabbitmq.config";

let server: Server;

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Connect to RabbitMQ
    await rabbitmqConnection.connect();

    // Start Express server
    server = app.listen(envConfig.port, () => {
      console.log("=================================");
      console.log(`🚀 Server running on port ${envConfig.port}`);
      console.log(`🌍 Environment: ${envConfig.nodeEnv}`);
      console.log("❤️  Health endpoint available at /health");
      console.log("=================================");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n⚠️  Received ${signal}. Starting graceful shutdown...`);

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          console.log("✅ HTTP server closed.");
          resolve();
        });
      });
    }

    await rabbitmqConnection.close();
    console.log("✅ RabbitMQ connection closed.");

    await disconnectDatabase();

    console.log("🎉 Graceful shutdown complete.");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during graceful shutdown:", error);
    process.exit(1);
  }
};

// Shutdown signals
process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: unknown) => {
  console.error("❌ Unhandled Promise Rejection:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Start server
void startServer();
