import type { Request, RequestHandler, Response } from "express";
import type { SupportMessage } from "@shared/schema";

export const MAX_SUPPORT_MESSAGE_LENGTH = 5000;

type SupportMessageUpdater = (
  id: number,
  message: string,
  adminId: number,
) => Promise<SupportMessage | undefined>;

type SupportConversationReader = () => Promise<Array<{
  userId: number;
  userFullName: string;
  userPhone: string;
  isClosed: boolean;
  closedAt: Date | null;
  messages: SupportMessage[];
}>>;

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createAdminSupportConversationsHandler(
  getAllSupportConversations: SupportConversationReader,
): RequestHandler {
  return async (_req, res) => {
    try {
      res.json(await getAllSupportConversations());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  };
}

export function createAdminSupportMessageEditHandler(
  updateSupportMessage: SupportMessageUpdater,
): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const id = Number(routeParam(req, "id"));
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ message: "Message invalide" });
        return;
      }

      const message = typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";
      if (!message) {
        res.status(400).json({ message: "Le message ne peut pas être vide" });
        return;
      }
      if (message.length > MAX_SUPPORT_MESSAGE_LENGTH) {
        res.status(400).json({ message: "Le message ne doit pas dépasser 5 000 caractères" });
        return;
      }

      const updatedMessage = await updateSupportMessage(id, message, req.session.userId!);
      if (!updatedMessage) {
        res.status(404).json({ message: "Seuls les messages de l'administrateur peuvent être modifiés" });
        return;
      }
      res.json(updatedMessage);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  };
}