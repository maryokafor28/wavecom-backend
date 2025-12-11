import app from "./app";
import { envConfig } from "./config/env.config";
import { connectDatabase } from "./config/database.config";

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Start Express server
    app.listen(envConfig.port, () => {
      console.log("=================================");
      console.log(`Server running on port ${envConfig.port}`);
      console.log(`Environment: ${envConfig.nodeEnv}`);
      console.log(` Health check: http://localhost:${envConfig.port}/health`);
      console.log("=================================");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Start the server
startServer();
