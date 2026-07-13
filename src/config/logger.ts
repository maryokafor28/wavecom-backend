import pino from "pino";
import { envConfig } from "./env.config";

const isDevelopment = envConfig.nodeEnv === "development";

export const logger = pino({
  level: envConfig.logLevel,

  // Pretty-print only in dev — production should emit raw structured JSON
  // so log aggregators (Datadog, CloudWatch, etc.) can parse it properly.
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,

  // Attach these to every log line automatically
  base: {
    env: envConfig.nodeEnv,
  },

  timestamp: pino.stdTimeFunctions.isoTime,
});
