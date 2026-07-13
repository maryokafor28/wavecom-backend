import type { Server } from "http";

import app from "./app";
import { envConfig } from "./config/env.config";
import { connectDatabase, disconnectDatabase } from "./config/database.config";
import { rabbitmqConnection } from "./config/rabbitmq.config";
import { logger } from "./config/logger";

const log = logger.child({ module: "server" });

const SHUTDOWN_TIMEOUT_MS = 15_000;

let server: Server;

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    await rabbitmqConnection.connect();

    server = app.listen(envConfig.port, () => {
      log.info(
        { port: envConfig.port, environment: envConfig.nodeEnv },
        "Server running",
      );
    });
  } catch (error) {
    log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string): Promise<void> => {
  log.warn({ signal }, "Received shutdown signal, starting graceful shutdown");

  // Forced-exit backstop: if shutdown hangs (e.g. a request stuck on a slow
  // downstream call), don't let the process hang forever — log and bail.
  const forceExitTimer = setTimeout(() => {
    log.error(
      { timeoutMs: SHUTDOWN_TIMEOUT_MS },
      "Graceful shutdown timed out, forcing exit",
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // don't let this timer itself keep the process alive

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          log.info("HTTP server closed");
          resolve();
        });
      });
    }

    await rabbitmqConnection.close();
    log.info("RabbitMQ connection closed");

    await disconnectDatabase();

    log.info("Graceful shutdown complete");

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    log.error({ err: error }, "Error during graceful shutdown");
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

process.on("unhandledRejection", (reason: unknown) => {
  log.error({ reason }, "Unhandled promise rejection");
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  log.error({ err: error }, "Uncaught exception");
  process.exit(1);
});

void startServer();
