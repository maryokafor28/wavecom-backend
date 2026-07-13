import { NotificationChannel } from "../types";

export const VALID_CHANNELS: NotificationChannel[] = ["email", "sms", "push"];
export const MAX_LIST_LIMIT = 100;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose E.164-ish check — tighten later if you adopt a proper phone validation lib.
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

export function isValidChannel(
  channel: string,
): channel is NotificationChannel {
  return VALID_CHANNELS.includes(channel as NotificationChannel);
}

export function isValidRecipient(
  channel: NotificationChannel,
  recipient: string,
): boolean {
  if (channel === "email") return EMAIL_REGEX.test(recipient);
  if (channel === "sms") return PHONE_REGEX.test(recipient);
  return true; // push tokens vary too much in shape to validate generically here
}

export function parsePagination(
  page: unknown,
  limit: unknown,
): { pageNum: number; limitNum: number } {
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(
    MAX_LIST_LIMIT,
    Math.max(1, parseInt(limit as string, 10) || 20),
  );
  return { pageNum, limitNum };
}
