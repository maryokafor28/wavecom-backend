import { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";

const log = logger.child({ module: "error-middleware" });

// Catches any route/path that didn't match a defined route.
// Must be registered after all real routes, before the error handler.
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
};

// Catches any error passed to next(err), or thrown in an async route handler
// (Express 5 auto-forwards those). Must be registered last, after everything
// else — Express identifies error middleware by its 4-argument signature.
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void => {
  log.error({ err, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
};
