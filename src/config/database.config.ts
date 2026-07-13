import mongoose from "mongoose";
import { envConfig } from "./env.config";
import { logger } from "./logger";

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

const log = logger.child({ module: "database" });

export const connectDatabase = async (retries = MAX_RETRIES): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(envConfig.mongodbUri, {
        serverSelectionTimeoutMS: 5000,
      });

      log.info("MongoDB connected successfully");
      log.info({ database: mongoose.connection.name }, "Database ready");
      return;
    } catch (error) {
      log.error(
        { err: error, attempt, retries },
        "MongoDB connect attempt failed",
      );

      if (attempt === retries) {
        log.error("Failed to connect to MongoDB after all retries");
        throw error;
      }

      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      log.info("MongoDB connection closed");
    }
  } catch (error) {
    log.error({ err: error }, "Error while disconnecting MongoDB");
    throw error;
  }
};

mongoose.connection.on("connected", () => {
  log.info("MongoDB connection established");
});

mongoose.connection.on("disconnected", () => {
  log.warn("MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  log.info("MongoDB reconnected");
});

mongoose.connection.on("error", (error) => {
  log.error({ err: error }, "MongoDB connection error");
});
