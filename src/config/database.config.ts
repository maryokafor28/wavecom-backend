import mongoose from "mongoose";
import { envConfig } from "./env.config";

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(envConfig.mongodbUri);

    console.log(" MongoDB connected successfully");
    console.log(` Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // Exit if database connection fails
  }
};

// Handle connection events
mongoose.connection.on("disconnected", () => {
  console.log(" MongoDB disconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB error:", error);
});
