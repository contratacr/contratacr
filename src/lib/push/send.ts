import { createAdminClient } from "@/lib/supabase/admin";
import { getFirebaseMessaging } from "@/lib/push/firebase-admin";
import { isMissingPushTransportColumn } from "@/lib/push/migration-compat";

type SendUserPushOptions = {
  userId: string;
  title: string;
  body: string;
  url?: string;
};

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function compactPushText(value: string, maxLength = 112) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export async function sendUserPush({ userId, title, body, url = "/es/notificaciones" }: SendUserPushOptions) {
  const db = createAdminClient();
  let { data, error } = await db
    .from("user_push_tokens")
    .select("id, token")
    .eq("user_id", userId)
    .eq("transport", "fcm")
    .eq("is_active", true);

  if (isMissingPushTransportColumn(error)) {
    // Migration 140 compatibility during the short code-before-schema deploy
    // window. Never fall back on timeouts or permission/provider failures.
    ({ data, error } = await db
      .from("user_push_tokens")
      .select("id, token")
      .eq("user_id", userId)
      .eq("is_active", true));
  }

  if (error) {
    const detail = /user_push_tokens/i.test(error.message)
      ? "push_tokens_table_missing_or_unavailable"
      : "push_tokens_read_failed";
    throw new Error(`${detail}: ${error.message}`);
  }

  const rows = (data ?? []).filter((row) => typeof row.token === "string" && row.token.length > 10);
  if (rows.length === 0) return { sent: 0, failed: 0, inactive: 0 };

  const messaging = getFirebaseMessaging();
  const compactBody = compactPushText(body);
  const response = await messaging.sendEachForMulticast({
    tokens: rows.map((row) => row.token),
    notification: { title: compactPushText(title, 72), body: compactBody },
    data: { url },
    android: {
      priority: "high",
      notification: {
        icon: "ic_stat_contratacr",
        color: "#009FD9",
        body: compactBody,
        notificationCount: 1,
      },
    },
  });

  const invalidIds = response.responses
    .map((result, index) => ({ result, id: rows[index]?.id }))
    .filter(({ result, id }) => id && !result.success && INVALID_TOKEN_ERRORS.has(result.error?.code ?? ""))
    .map(({ id }) => id);

  if (invalidIds.length > 0) {
    await db.from("user_push_tokens").update({ is_active: false }).in("id", invalidIds);
  }

  return {
    sent: response.successCount,
    failed: response.failureCount,
    inactive: invalidIds.length,
  };
}
