import Notification from "../models/notification.model";
import { logger } from "../config/logger";

const log = logger.child({ module: "notification-stats-service" });

export interface INotificationStats {
  total: number;
  delivered: number;
  queued: number;
  processing: number;
  failed: number;
  deliveryRate: number;
  avgDeliveryTimeMs: number | null;
  retryRate: number;
}

export interface INotificationAnalytics {
  perHour: { hour: string; count: number }[];
  byChannel: Record<string, number>;
  successRateByChannel: Record<string, number>;
}

class NotificationStatsService {
  private buildBaseFilter(recipientId?: string): Record<string, unknown> {
    return recipientId ? { recipientId } : {};
  }

  async getStats(recipientId?: string): Promise<INotificationStats> {
    const baseFilter = this.buildBaseFilter(recipientId);

    const [statusCounts, latencyResult, retryResult, total] = await Promise.all(
      [
        Notification.aggregate([
          { $match: baseFilter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Notification.aggregate([
          { $match: { ...baseFilter, status: "sent", latency: { $ne: null } } },
          { $group: { _id: null, avgLatency: { $avg: "$latency" } } },
        ]),
        Notification.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              retried: { $sum: { $cond: [{ $gt: ["$attempts", 1] }, 1, 0] } },
            },
          },
        ]),
        Notification.countDocuments(baseFilter),
      ],
    );

    const counts: Record<string, number> = {
      pending: 0,
      queued: 0,
      processing: 0,
      sent: 0,
      failed: 0,
    };
    for (const row of statusCounts) {
      counts[row._id] = row.count;
    }

    const delivered = counts.sent;
    const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;

    const avgDeliveryTimeMs = latencyResult[0]?.avgLatency ?? null;

    const retryRow = retryResult[0];
    const retryRate =
      retryRow && retryRow.total > 0
        ? (retryRow.retried / retryRow.total) * 100
        : 0;

    return {
      total,
      delivered,
      queued: counts.queued,
      processing: counts.processing,
      failed: counts.failed,
      deliveryRate: Math.round(deliveryRate * 10) / 10,
      avgDeliveryTimeMs:
        avgDeliveryTimeMs !== null ? Math.round(avgDeliveryTimeMs) : null,
      retryRate: Math.round(retryRate * 10) / 10,
    };
  }

  async getAnalytics(recipientId?: string): Promise<INotificationAnalytics> {
    const baseFilter = this.buildBaseFilter(recipientId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [perHourRaw, byChannelRaw, successRaw] = await Promise.all([
      Notification.aggregate([
        { $match: { ...baseFilter, createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateTrunc: { date: "$createdAt", unit: "hour" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Notification.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$channel", count: { $sum: 1 } } },
      ]),
      Notification.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: "$channel",
            total: { $sum: 1 },
            sent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const perHour = perHourRaw.map((row) => ({
      hour: row._id.toISOString(),
      count: row.count,
    }));

    const byChannel: Record<string, number> = {};
    for (const row of byChannelRaw) {
      byChannel[row._id] = row.count;
    }

    const successRateByChannel: Record<string, number> = {};
    for (const row of successRaw) {
      successRateByChannel[row._id] =
        row.total > 0 ? Math.round((row.sent / row.total) * 1000) / 10 : 0;
    }

    return { perHour, byChannel, successRateByChannel };
  }
}

export const notificationStatsService = new NotificationStatsService();
