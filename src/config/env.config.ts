import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

interface EnvConfig {
  port: number;
  mongodbUri: string;
  rabbitmqUri: string;
  nodeEnv: string;
}

const getEnvVariable = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const envConfig: EnvConfig = {
  port: parseInt(getEnvVariable("PORT", "3000"), 10),
  mongodbUri: getEnvVariable("MONGODB_URI"),
  rabbitmqUri: getEnvVariable("RABBITMQ_URI"),
  nodeEnv: getEnvVariable("NODE_ENV", "development"),
};
