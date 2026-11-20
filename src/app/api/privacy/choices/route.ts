import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { LEGAL_VERSION, privacyChoiceVersion } from "@/lib/privacy/legal-version";
const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "No se pudo guardar o consultar su elección. Inténtelo nuevamente." }, { status: 503, headers });
export async function GET() {
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
    const { data, error } = await db.from("privacy_choices").select("purpose,accepted,version,recorded_at").eq("user_id", user.id).order("id", { ascending: false }).limit(200);
    if (error) return unavailable();
    const choices: Record<string, { accepted: boolean; version: string }> = {};
    for (const row of data ?? []) if (!choices[row.purpose]) choices[row.purpose] = { accepted: row.accepted, version: row.version };
    return NextResponse.json({ version: LEGAL_VERSION, choices, requiresAcceptance: choices.terms?.version !== LEGAL_VERSION || choices.terms?.accepted !== true }, { headers });
  } catch { return unavailable(); }
}
export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "privacy-choice", 30, 60_000);
  if (limited) return limited;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  try {
    const body = await req.json();
    if (!["terms","marketing","advertising","ai","analytics"].includes(body.purpose) || typeof body.accepted !== "boolean" || body.version !== privacyChoiceVersion(body.purpose) || !["es","en"].includes(body.locale) || !["web","native"].includes(body.channel))
      return NextResponse.json({ error: "INVALID_CHOICE" }, { status: 400, headers });
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
    const { data, error } = await db.rpc("record_privacy_choice", { p_purpose: body.purpose, p_accepted: body.accepted, p_locale: body.locale, p_channel: body.channel });
    if (error || !data) return unavailable();
    return NextResponse.json({ ok: true, receipt: String(data), version: privacyChoiceVersion(body.purpose) }, { headers });
  } catch { return unavailable(); }
}
