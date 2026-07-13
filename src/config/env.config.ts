import dotenv from "dotenv";

dotenv.config();

type NodeEnv = "development" | "production" | "test";

interface EnvConfig {
  port: number;
  mongodbUri: string;
  rabbitmqUrl: string;
  nodeEnv: NodeEnv;
  logLevel: string;
  corsOrigin: string;
}

const getEnvVariable = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const parsePort = (value: string): number => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(
      `Invalid PORT value: "${value}". Must be a number between 1 and 65535.`,
    );
  }
  return parsed;
};

const parseNodeEnv = (value: string): NodeEnv => {
  if (value !== "development" && value !== "production" && value !== "test") {
    throw new Error(
      `Invalid NODE_ENV value: "${value}". Must be development, production, or test.`,
    );
  }
  return value;
};

const validateMongoUri = (uri: string): string => {
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error("MONGODB_URI must start with mongodb:// or mongodb+srv://");
  }
  return uri;
};

const validateRabbitmqUrl = (url: string): string => {
  if (!url.startsWith("amqp://") && !url.startsWith("amqps://")) {
    throw new Error("RABBITMQ_URL must start with amqp:// or amqps://");
  }
  return url;
};

export const envConfig: EnvConfig = Object.freeze({
  port: parsePort(getEnvVariable("PORT", "3000")),
  mongodbUri: validateMongoUri(getEnvVariable("MONGODB_URI")),
  rabbitmqUrl: validateRabbitmqUrl(getEnvVariable("RABBITMQ_URL")),
  nodeEnv: parseNodeEnv(getEnvVariable("NODE_ENV", "development")),
  logLevel: getEnvVariable("LOG_LEVEL", "info"),
  corsOrigin: getEnvVariable("CORS_ORIGIN", "*"),
});
