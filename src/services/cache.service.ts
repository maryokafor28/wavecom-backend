import { redisClient } from "../config/redis.config";
import { logger } from "../config/logger";

const log = logger.child({ module: "cache-service" });

const NOTIFICATION_TTL_SECONDS = 60;
const LIST_TTL_SECONDS = 20;

class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redisClient.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as T;
    } catch (error) {
      // Fail open: a cache read failure should never break the request —
      // just treat it as a cache miss and fall through to the database.
      log.warn({ err: error, key }, "Cache read failed, treating as miss");
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      // Fail open on writes too: if we can't cache it, the request still
      // succeeded against the database — that's what matters.
      log.warn({ err: error, key }, "Cache write failed");
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (error) {
      log.warn({ err: error, key }, "Cache invalidation failed");
    }
  }

  buildNotificationKey(id: string): string {
    return `notification:${id}`;
  }

  buildListKey(query: Record<string, unknown>): string {
    const { status, channel, page = "1", limit = "20" } = query;
    return `notifications:list:status=${status ?? "all"}:channel=${channel ?? "all"}:page=${page}:limit=${limit}`;
  }

  get notificationTtl(): number {
    return NOTIFICATION_TTL_SECONDS;
  }

  get listTtl(): number {
    return LIST_TTL_SECONDS;
  }
}

export const cacheService = new CacheService();
