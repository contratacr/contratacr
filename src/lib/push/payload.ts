import type { MulticastMessage } from "firebase-admin/messaging";

const DEFAULT_NOTIFICATION_URL = "/es/notificaciones";

export function compactPushText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function notificationPushUrl(data: unknown): string {
  if (!data || typeof data !== "object") return DEFAULT_NOTIFICATION_URL;

  const payload = data as {
    link?: unknown;
    booking_id?: unknown;
    project_id?: unknown;
    proposal_id?: unknown;
    conversation_id?: unknown;
  };
  const raw = typeof payload.link === "string"
    && payload.link.startsWith("/")
    && !payload.link.startsWith("//")
    ? payload.link
    : DEFAULT_NOTIFICATION_URL;
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

type PushPayloadInput = {
  tokens: string[];
  title: string;
  body: string;
  data?: unknown;
  notificationId?: string | null;
};

/** Build the only provider payload supported by the worker: Firebase Cloud
 * Messaging. FCM data values must be strings, so private notification metadata
 * deliberately stays in Supabase and only a safe in-app destination is sent. */
export function buildFcmMulticastPayload({
  tokens,
  title,
  body,
  data,
  notificationId,
}: PushPayloadInput): MulticastMessage {
  const compactBody = compactPushText(body, 112);
  const fcmData: Record<string, string> = {
    url: notificationPushUrl(data),
  };
  if (notificationId) fcmData.notificationId = notificationId;

  return {
    tokens,
    notification: {
      title: compactPushText(title, 72),
      body: compactBody,
    },
    data: fcmData,
    android: {
      priority: "high",
      ...(notificationId ? { collapseKey: notificationId } : {}),
      notification: {
        icon: "ic_stat_contratacr",
        color: "#009FD9",
        body: compactBody,
        notificationCount: 1,
        ...(notificationId ? { tag: notificationId } : {}),
      },
    },
  };
}
