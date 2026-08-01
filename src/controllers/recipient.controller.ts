import { Request, Response } from "express";
import { HydratedDocument } from "mongoose";
import { ICreateRecipientRequest, IRecipient } from "../types";
import { logger } from "../config/logger";
import { recipientService } from "../services/recipient.service";

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

      const recipient = await recipientService.createAndWelcome(body);

      res.status(201).json({
        status: "success",
        message: "Recipient created and welcome email queued",
        data: {
          id: recipient._id,
          name: recipient.name,
          email: recipient.email,
          preferredChannel: recipient.preferredChannel,
          createdAt: recipient.createdAt,
        },
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
      const recipients = await recipientService.list();

      res.status(200).json({
        status: "success",
        data: recipients.map((r: HydratedDocument<IRecipient>) => ({
          id: r._id,
          name: r.name,
          email: r.email,
          preferredChannel: r.preferredChannel,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      log.error({ err: error }, "Error listing recipients");
      res.status(500).json({
        status: "error",
        message: "Failed to list recipients",
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
}

export const recipientController = new RecipientController();
