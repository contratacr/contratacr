import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export const ONCE_NOTIFICATION_TYPES = ["resena_google", "invita_proyecto", "completa_perfil", "pide_resenas", "agrega_precio"] as const;
export type OnceNotificationType = "resena_google" | "invita_proyecto" | "completa_perfil" | "pide_resenas" | "agrega_precio";
export type OnceReceipt = { user_id: string; type: OnceNotificationType; status: "sent" | "historical_unknown"; sent_at: string | null };

export async function onceReceipts(admin: Admin, ids: string[], types: OnceNotificationType[]) {
  const receipts: OnceReceipt[] = [];
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniqueIds.length; i += 200) {
    const { data, error } = await admin.from("notification_once_receipts")
      .select("user_id, type, status, sent_at").in("type", types).in("user_id", uniqueIds.slice(i, i + 200));
    if (error) throw error; // No ledger means no sending, never an empty history.
    receipts.push(...(data ?? []) as OnceReceipt[]);
  }
  return receipts;
}

export function hasRecentOnceReceipt(receipts: OnceReceipt[], userId: string, now = Date.now()) {
  return receipts.some((r) => r.user_id === userId && r.status === "sent"
    && r.sent_at !== null && now - Date.parse(r.sent_at) < 86_400_000);
}

export async function insertOnceNotifications(admin: Admin, rows: Array<{
  user_id: string; type: OnceNotificationType; title: string; message: string; data: { link: string }; read: boolean;
}>) {
  rows = [...rows].sort((a, b) => a.user_id.localeCompare(b.user_id));
  let sent = 0;
  for (let i = 0; i < rows.length; i += 200) {
    // The database trigger atomically skips existing receipts, including races.
    const { data, error } = await admin.from("notifications").insert(rows.slice(i, i + 200)).select("user_id");
    if (error) throw error;
    sent += (data ?? []).length;
  }
  return sent;
}
