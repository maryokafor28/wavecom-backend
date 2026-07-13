import Redis from "ioredis";
import { envConfig } from "./env.config";
import { logger } from "./logger";

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

const log = logger.child({ module: "redis" });

export const redisClient = new Redis(envConfig.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redisClient.on("connect", () => {
  log.info("Redis TCP connection established");
});

redisClient.on("ready", () => {
  log.info("Redis client ready");
});

redisClient.on("reconnecting", (delay: number) => {
  log.warn({ delay }, "Redis reconnecting");
});

redisClient.on("close", () => {
  log.warn("Redis connection closed");
});

redisClient.on("end", () => {
  log.warn("Redis connection ended");
});

redisClient.on("error", (error) => {
  log.error({ err: error }, "Redis client error");
});

export const connectRedis = async (retries = MAX_RETRIES): Promise<void> => {
  // The RedisStore used by the rate limiter can trigger an implicit
  // connection as soon as app.ts is imported (ioredis auto-connects on
  // its first command even with lazyConnect: true). If that's already
  // happened, there's nothing left to do here.
  if (redisClient.status === "ready" || redisClient.status === "connecting") {
    log.info({ status: redisClient.status }, "Redis already connected");
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log.info({ attempt, retries }, "Connecting to Redis...");
      await redisClient.connect();
      log.info("Redis connected successfully");
      return;
    } catch (error) {
      log.error(
        {
          err: error,
          attempt,
          retries,
        },
        "Redis connection attempt failed",
      );
      if (attempt === retries) {
        log.error("Failed to connect to Redis after all retries");
        throw error;
      }
      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

export const disconnectRedis = async (): Promise<void> => {
  try {
    if (redisClient.status !== "end") {
      await redisClient.quit();
      log.info("Redis disconnected");
    }
  } catch (error) {
    log.error({ err: error }, "Failed to disconnect Redis");
    throw error;
  }
};
