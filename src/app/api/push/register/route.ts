import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  token: z.string().trim().min(10),
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
  const db = createAdminClient();

  const { error } = await db.from("user_push_tokens").upsert(
    {
      user_id: user.id,
      token,
      platform,
      device_id: deviceId || null,
      app_version: appVersion || null,
      is_active: true,
    },
    {
      onConflict: "user_id, platform, token",
      ignoreDuplicates: false,
    },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
