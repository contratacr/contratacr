import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { sendNotificationPush } from "@/lib/push/notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tells a professional they have a new follower. The follow row itself is
 * written by the follower's browser (RLS lets them manage only their own
 * follows), so this endpoint re-verifies the relationship server-side and
 * then creates the notification the follower could never insert directly.
 * Duplicate-safe: one notification per follower/professional pair.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const professionalId = typeof body.professionalId === "string" ? body.professionalId.trim() : "";
  if (!UUID_RE.test(professionalId)) {
    return NextResponse.json({ error: "Profesional inválido." }, { status: 400 });
  }
  const viewer = await createClient().then((supabase) => safeGetUser(supabase)).catch(() => null);
  if (!viewer) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: follow } = await admin
    .from("professional_follows")
    .select("id")
    .eq("follower_id", viewer.id)
    .eq("professional_id", professionalId)
    .maybeSingle();
  if (!follow) return NextResponse.json({ notified: false });

  const { data: professional } = await admin
    .from("professionals")
    .select("profile_id")
    .eq("id", professionalId)
    .maybeSingle();
  const recipientId = (professional as { profile_id?: string | null } | null)?.profile_id ?? null;
  if (!recipientId || recipientId === viewer.id) return NextResponse.json({ notified: false });

  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", recipientId)
    .eq("type", "professional_follow")
    .eq("data->>follower_id", viewer.id)
    .limit(1);
  if (existing?.length) return NextResponse.json({ notified: false });

  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", viewer.id).maybeSingle();
  const followerName = (profile as { full_name?: string | null } | null)?.full_name?.trim() || "Alguien";
  const notification = {
    user_id: recipientId,
    type: "professional_follow",
    title: "Nuevo seguidor",
    message: `${followerName} empezó a seguir tu perfil.`,
    data: { follower_id: viewer.id },
  };
  const { error } = await admin.from("notifications").insert(notification);
  if (error) {
    console.error("[professional-followers/notify] insert failed:", error.message);
    return NextResponse.json({ notified: false });
  }
  await sendNotificationPush({ userId: recipientId, title: notification.title, message: notification.message, data: notification.data });
  return NextResponse.json({ notified: true });
}
