import { sendUserPush } from "@/lib/push/send";

type NotificationPushInput = {
  userId?: string | null;
  title?: string | null;
  message?: string | null;
  data?: unknown;
};

function notificationUrl(data: unknown): string {
  if (!data || typeof data !== "object") return "/es/notificaciones";

  const payload = data as {
    link?: unknown;
    booking_id?: unknown;
    project_id?: unknown;
    proposal_id?: unknown;
    conversation_id?: unknown;
  };
  const raw = typeof payload.link === "string" && payload.link.startsWith("/")
    ? payload.link
    : "/es/notificaciones";
  const target = new URL(raw, "https://contratacr.com");

  if (typeof payload.booking_id === "string" && payload.booking_id) {
    target.searchParams.set("booking", payload.booking_id);
  }
  if (typeof payload.project_id === "string" && payload.project_id) {
    target.searchParams.set("project", payload.project_id);
  }
  if (typeof payload.proposal_id === "string" && payload.proposal_id) {
    target.searchParams.set("proposal", payload.proposal_id);
  }
  if (typeof payload.conversation_id === "string" && payload.conversation_id) {
    target.searchParams.set("conversation", payload.conversation_id);
  }

  return `${target.pathname}${target.search}${target.hash}`;
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
