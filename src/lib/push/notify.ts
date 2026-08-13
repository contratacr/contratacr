import { notificationPushUrl } from "@/lib/push/payload";
import { sendUserPush } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";

type NotificationPushInput = {
  userId?: string | null;
  title?: string | null;
  message?: string | null;
  data?: unknown;
};

export type StoredNotificationPush = {
  user_id?: string | null;
  title?: string | null;
  message?: string | null;
  data?: unknown;
};

let durableOutboxDetected = false;

async function hasDurablePushOutbox() {
  if (durableOutboxDetected) return true;
  const { error } = await createAdminClient()
    .from("notification_push_outbox")
    .select("id")
    .limit(1);
  if (!error) durableOutboxDetected = true;
  if (!error) return true;

  // Compatibility is needed only while migration 167 is genuinely absent.
  // A timeout, permissions error, or transient PostgREST failure must fail
  // closed: the INSERT trigger may already have captured the notification and
  // an inline fallback would then deliver it twice.
  const missingTable = error.code === "42P01"
    || error.code === "PGRST205"
    || /notification_push_outbox.*(?:not found|does not exist|schema cache)/i.test(error.message);
  if (missingTable) return false;
  throw new Error("push_outbox_detection_failed");
}

export async function sendNotificationPush({ userId, title, message, data }: NotificationPushInput) {
  if (!userId || !title || !message) return;
  // Migration 167 captures the corresponding notification INSERT in the
  // durable outbox. Until that migration exists, preserve the legacy inline
  // path so deploying compatible code before SQL cannot lose notifications.
  // A negative result is deliberately not cached: a long-lived instance must
  // switch to the outbox immediately after the migration lands.
  try {
    if (await hasDurablePushOutbox()) return;
    await sendUserPush({
      userId,
      title,
      body: message,
      url: notificationPushUrl(data),
    });
  } catch (error) {
    console.error("[push] notification delivery failed:", error);
  }
}

export async function sendNotificationPushRows(rows: StoredNotificationPush[]) {
  await Promise.all(
    rows.map((row) => sendNotificationPush({
      userId: row.user_id,
      title: row.title,
      message: row.message,
      data: row.data,
    })),
  );
}
