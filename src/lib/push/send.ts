import { createAdminClient } from "@/lib/supabase/admin";
import { getFirebaseMessaging } from "@/lib/push/firebase-admin";

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

export async function sendUserPush({ userId, title, body, url = "/es/notificaciones" }: SendUserPushOptions) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("user_push_tokens")
    .select("id, token")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter((row) => typeof row.token === "string" && row.token.length > 10);
  if (rows.length === 0) return { sent: 0, failed: 0, inactive: 0 };

  const messaging = getFirebaseMessaging();
  const response = await messaging.sendEachForMulticast({
    tokens: rows.map((row) => row.token),
    notification: { title, body },
    data: { url },
    android: {
      priority: "high",
      notification: {
        clickAction: "OPEN_APP",
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
