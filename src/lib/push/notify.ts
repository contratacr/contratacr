import { sendUserPush } from "@/lib/push/send";

type NotificationPushInput = {
  userId?: string | null;
  title?: string | null;
  message?: string | null;
  data?: unknown;
};

function notificationUrl(data: unknown): string {
  if (data && typeof data === "object" && "link" in data) {
    const raw = (data as { link?: unknown }).link;
    if (typeof raw === "string" && raw.startsWith("/")) return raw;
  }
  return "/es/notificaciones";
}

export async function sendNotificationPush({ userId, title, message, data }: NotificationPushInput) {
  if (!userId || !title || !message) return;
  try {
    await sendUserPush({
      userId,
      title,
      body: message,
      url: notificationUrl(data),
    });
  } catch (error) {
    console.error("[push] notification delivery failed:", error);
  }
}
