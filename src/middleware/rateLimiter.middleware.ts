import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../config/redis.config";
import { logger } from "../config/logger";

const log = logger.child({ module: "rate-limiter" });

export const apiLimiter = rateLimit({
  // 100 requests every 15 minutes
  windowMs: 15 * 60 * 1000,
  limit: 100,

  standardHeaders: true,
  legacyHeaders: false,

  // If Redis is unavailable, continue serving requests instead
  // of making the entire API unavailable.
  passOnStoreError: true,

  // Use the client IP as the rate-limit key.
  keyGenerator: (req) => ipKeyGenerator(req.ip!),
  // Don't rate-limit health checks.
  skip: (req) => req.path === "/health",

  store: new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(...(args as [string, ...string[]])) as any,
  }),

  handler: (req, res) => {
    const retryAfter =
      (req as any).rateLimit?.resetTime instanceof Date
        ? Math.ceil(
            ((req as any).rateLimit.resetTime.getTime() - Date.now()) / 1000,
          )
        : undefined;

    log.warn(
      {
        ip: req.ip,
        method: req.method,
        path: req.originalUrl,
      },
      "Rate limit exceeded",
    );

    res.status(429).json({
      status: "error",
      message: "Too many requests. Please try again later.",
      retryAfter,
    });
  },
});
