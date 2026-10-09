import { Request, Response } from "express";
import { HydratedDocument, isValidObjectId } from "mongoose";
import { ICreateRecipientRequest, IRecipient } from "../types";
import { logger } from "../config/logger";
import { isValidChannel } from "../validators/notification.validator";
import {
  normalizePhone,
  isValidPhone,
} from "../validators/recipient.validator";
import {
  recipientService,
  IUpdateRecipientInput,
} from "../services/recipient.service";

const log = logger.child({ module: "recipient-controller" });

class RecipientController {
  async createRecipient(req: Request, res: Response): Promise<void> {
    try {
      const body: ICreateRecipientRequest = req.body;
      const { name, email } = body;

      if (!name || !email) {
        res.status(400).json({
          status: "error",
          message: "Missing required fields: name, email",
        });
        return;
      }

      const { recipient, isNew } =
        await recipientService.findOrCreateAndWelcome(body);

      res.status(isNew ? 201 : 200).json({
        status: "success",
        message: isNew
          ? "Recipient created and welcome email queued"
          : "Recipient already exists",
        data: {
          id: recipient._id,
          name: recipient.name,
          email: recipient.email,
          preferredChannel: recipient.preferredChannel,
          createdAt: recipient.createdAt,
        },
        isNew,
      });
    } catch (error) {
      log.error({ err: error }, "Error creating recipient");
      res.status(500).json({
        status: "error",
        message: "Failed to create recipient",
      });
    }
  }
  async getRecipient(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const recipient = await recipientService.getById(id);

      if (!recipient) {
        res.status(404).json({
          status: "error",
          message: "Recipient not found",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        data: {
          id: recipient._id,
          name: recipient.name,
          email: recipient.email,
          phone: recipient.phone,
          preferredChannel: recipient.preferredChannel,
          createdAt: recipient.createdAt,
          updatedAt: recipient.updatedAt,
        },
      });
    } catch (error) {
      log.error({ err: error }, "Error fetching recipient");
      res.status(500).json({
        status: "error",
        message: "Failed to fetch recipient",
      });
    }
  }

  async listRecipients(req: Request, res: Response): Promise<void> {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

      const { recipients, pagination } = await recipientService.list(
        page,
        limit,
      );

      res.status(200).json({
        status: "success",
        data: recipients.map((r: HydratedDocument<IRecipient>) => ({
          id: r._id,
          name: r.name,
          email: r.email,
          preferredChannel: r.preferredChannel,
          createdAt: r.createdAt,
        })),
        pagination,
      });
    } catch (error) {
      log.error({ err: error }, "Error listing recipients");

      res.status(500).json({
        status: "error",
        message: "Failed to list recipients",
      });
    }
  }

  async updateRecipient(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        res.status(400).json({
          status: "error",
          message: "Invalid recipient id",
        });
        return;
      }

      const { name, phone, preferredChannel } = req.body ?? {};
      const input: IUpdateRecipientInput = {};

      if (name !== undefined) {
        if (
          typeof name !== "string" ||
          !name.trim() ||
          name.trim().length > 200
        ) {
          res.status(400).json({
            status: "error",
            message: "name must be a non-empty string (max 200 characters)",
          });
          return;
        }
        input.name = name.trim();
      }

      if (phone !== undefined) {
        if (phone === null || phone === "") {
          input.phone = null;
        } else {
          const normalized =
            typeof phone === "string" ? normalizePhone(phone) : "";
          if (!isValidPhone(normalized)) {
            res.status(400).json({
              status: "error",
              message:
                "phone must be in international format, e.g. +2347012345678",
            });
            return;
          }
          input.phone = normalized;
        }
      }

      if (preferredChannel !== undefined) {
        if (!isValidChannel(preferredChannel)) {
          res.status(400).json({
            status: "error",
            message: "Invalid preferredChannel. Must be: email, sms, or push",
          });
          return;
        }
        input.preferredChannel = preferredChannel;
      }

      if (Object.keys(input).length === 0) {
        res.status(400).json({
          status: "error",
          message: "Provide at least one of: name, phone, preferredChannel",
        });
        return;
      }

      const recipient = await recipientService.update(id, input);

      if (!recipient) {
        res.status(404).json({
          status: "error",
          message: "Recipient not found",
        });
        return;
      }

      log.info(
        { recipientId: id, fields: Object.keys(input) },
        "Recipient updated",
      );

      res.status(200).json({
        status: "success",
        message: "Recipient updated",
        data: {
          id: recipient._id,
          name: recipient.name,
          email: recipient.email,
          phone: recipient.phone,
          preferredChannel: recipient.preferredChannel,
          createdAt: recipient.createdAt,
          updatedAt: recipient.updatedAt,
        },
      });
    } catch (error) {
      log.error({ err: error }, "Error updating recipient");
      res.status(500).json({
        status: "error",
        message: "Failed to update recipient",
      });
    }
  }
  async deleteRecipient(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const recipient = await recipientService.deleteById(id);

      if (!recipient) {
        res.status(404).json({
          status: "error",
          message: "Recipient not found",
        });
        return;
      }

      log.info({ recipientId: id }, "Recipient deleted");

      res.status(200).json({
        status: "success",
        message: "Recipient deleted successfully",
        data: { id: recipient._id },
      });
    } catch (error) {
      log.error({ err: error }, "Error deleting recipient");
      res.status(500).json({
        status: "error",
        message: "Failed to delete recipient",
      });
    }
  }

  async updatePushToken(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { pushToken } = req.body;

      if (!pushToken || typeof pushToken !== "string") {
        res.status(400).json({
          status: "error",
          message: "Missing or invalid field: pushToken",
        });
        return;
      }

      const recipient = await recipientService.updatePushToken(id, pushToken);

      if (!recipient) {
        res.status(404).json({
          status: "error",
          message: "Recipient not found",
        });
        return;
      }

      log.info({ recipientId: id }, "Recipient push token updated");

      res.status(200).json({
        status: "success",
        message: "Push token updated",
        data: {
          id: recipient._id,
          pushToken: recipient.pushToken,
        },
      });
    } catch (error) {
      log.error({ err: error }, "Error updating push token");
      res.status(500).json({
        status: "error",
        message: "Failed to update push token",
      });
    }
  }
}

export const recipientController = new RecipientController();
