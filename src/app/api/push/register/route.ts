import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingPushRpc } from "@/lib/push/migration-compat";

const bodySchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["android", "ios", "web"]).default("android"),
  deviceId: z.string().trim().max(255).optional(),
  appVersion: z.string().trim().max(64).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido" }, { status: 400 });

  const { token, platform, deviceId, appVersion } = parsed.data;

  // Capacitor exposes the native APNs device token on iOS. Firebase Admin
  // cannot send to that token; iOS registration stays disabled until the
  // native shell supplies a real FCM registration token.
  if (platform === "ios" && /^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.json({ error: "iOS push no esta configurado" }, { status: 422 });
  }

  const { error } = await supabase.rpc("register_user_push_token", {
    p_token: token,
    p_platform: platform,
    p_device_id: deviceId || null,
    p_app_version: appVersion || null,
    p_transport: "fcm",
  });

  if (error && isMissingPushRpc(error, "register_user_push_token")) {
    // Deployment compatibility: Vercel can publish this route moments before
    // migration 167 creates the RPC. Use migration-140's exact legacy shape
    // only when PostgREST proves that the RPC is genuinely absent.
    const { error: legacyError } = await createAdminClient().from("user_push_tokens").upsert({
      user_id: user.id,
      token,
      platform,
      device_id: deviceId || null,
      app_version: appVersion || null,
      is_active: true,
    }, { onConflict: "user_id, platform, token", ignoreDuplicates: false });
    if (!legacyError) return NextResponse.json({ ok: true, compatibility: "migration-140" });
  }
  if (error) return NextResponse.json({ error: "No pudimos registrar las notificaciones" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = z.object({ token: z.string().trim().min(10).max(4096) })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido" }, { status: 400 });

  const { error } = await supabase.rpc("deactivate_user_push_token", {
    p_token: parsed.data.token,
    p_transport: "fcm",
  });
  if (error && isMissingPushRpc(error, "deactivate_user_push_token")) {
    const { error: legacyError } = await createAdminClient()
      .from("user_push_tokens")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("token", parsed.data.token)
      .eq("is_active", true);
    if (!legacyError) return NextResponse.json({ ok: true, compatibility: "migration-140" });
  }
  if (error) return NextResponse.json({ error: "No pudimos desactivar las notificaciones" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
