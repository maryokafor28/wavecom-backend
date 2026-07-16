// Every real provider (Resend, Twilio, FCM, etc.) implements this shape.
// Swapping mock → real means adding a class here and changing the
// provider selection in notification.service.ts — nothing else changes.
export interface NotificationProvider {
  send(recipient: string, message: string, subject?: string): Promise<boolean>;
}

// SMS gets its own result shape (rather than reusing NotificationProvider's
// plain boolean) so the real failure reason — e.g. a Twilio trial limitation —
// can be surfaced on the notification record instead of a generic message.
export interface SmsSendResult {
  success: boolean;
  error?: string;
}

export interface SmsNotificationProvider {
  send(recipient: string, message: string): Promise<SmsSendResult>;
}
