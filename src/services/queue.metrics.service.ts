import { envConfig } from "../config/env.config";
import { logger } from "../config/logger";

const log = logger.child({ module: "queue-metrics-service" });

const NOTIFICATION_QUEUE = "notifications";
const DEAD_LETTER_QUEUE = "notifications.dlq";

interface RabbitMQQueueResponse {
  messages_ready: number;
  messages_unacknowledged: number;
  messages: number;
  consumers: number;
  message_stats?: {
    publish_details?: { rate: number };
    deliver_get_details?: { rate: number };
  };
}

export interface QueueMetrics {
  queue: string;
  waiting: number;
  processing: number;
  total: number;
  consumers: number;
}

export interface QueueStats {
  main: QueueMetrics;
  deadLetter: QueueMetrics;
}

class QueueMetricsService {
  // Parsed once at construction — pulls username, password, and vhost
  // straight out of the existing RABBITMQ_URL rather than duplicating
  // credentials under separate env var names.
  private readonly authHeader: string;
  private readonly vhost: string;

  constructor() {
    const parsed = new URL(envConfig.rabbitmqUrl);

    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    this.authHeader =
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

    // CloudAMQP's vhost is the path segment, URL-encoded when used in the
    // Management API (a vhost of "/" becomes "%2F", instance-named vhosts
    // like "gbdwhvyp" are used as-is).
    const rawVhost = parsed.pathname.replace(/^\//, "") || "/";
    this.vhost = encodeURIComponent(rawVhost);
  }

  private async fetchQueue(queueName: string): Promise<QueueMetrics> {
    const url = `${envConfig.rabbitmqManagementUrl}/api/queues/${this.vhost}/${encodeURIComponent(queueName)}`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });

      if (!response.ok) {
        log.warn(
          { queue: queueName, status: response.status },
          "RabbitMQ management API returned non-OK status",
        );
        return {
          queue: queueName,
          waiting: 0,
          processing: 0,
          total: 0,
          consumers: 0,
        };
      }

      const data = (await response.json()) as RabbitMQQueueResponse;

      return {
        queue: queueName,
        waiting: data.messages_ready ?? 0,
        processing: data.messages_unacknowledged ?? 0,
        total: data.messages ?? 0,
        consumers: data.consumers ?? 0,
      };
    } catch (error) {
      log.error(
        { err: error, queue: queueName },
        "Failed to fetch queue metrics from RabbitMQ management API",
      );
      // Fail open — the dashboard should show zeros, not crash, if the
      // management API is briefly unreachable.
      return {
        queue: queueName,
        waiting: 0,
        processing: 0,
        total: 0,
        consumers: 0,
      };
    }
  }

  async getStats(): Promise<QueueStats> {
    const [main, deadLetter] = await Promise.all([
      this.fetchQueue(NOTIFICATION_QUEUE),
      this.fetchQueue(DEAD_LETTER_QUEUE),
    ]);

    return { main, deadLetter };
  }
}

export const queueMetricsService = new QueueMetricsService();
