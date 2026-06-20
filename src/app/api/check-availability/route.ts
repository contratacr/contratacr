import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Lightweight existence checks for inline, real-time validation of the email
// and cédula fields during registration / booking.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim();
  const cedula = searchParams.get("cedula")?.replace(/\D/g, "");

  const admin = createAdminClient();
  const result: { emailTaken?: boolean; cedulaTaken?: boolean } = {};

  try {
    if (email) {
      // Authoritative against AUTH, not just profiles.email: a profiles row can hold an OLD
      // email after that account changed it (stale) — that email is actually FREE. So when a
      // profiles row matches, confirm its auth user STILL uses this email before reporting
      // "taken"; a stale/orphan match reads as available (matching the self-healing signup).
      const { data: rows } = await admin.from("profiles").select("id").ilike("email", email);
      let taken = false;
      for (const row of (rows ?? []) as { id: string }[]) {
        try {
          const { data: au } = await admin.auth.admin.getUserById(row.id);
          if (au?.user?.email && au.user.email.toLowerCase() === email.toLowerCase()) { taken = true; break; }
        } catch { /* transient — don't claim taken on a lookup error */ }
      }
      result.emailTaken = taken;
    }
    if (cedula && cedula.length >= 9) {
      const { data } = await admin.from("profiles").select("id").eq("cedula", cedula).maybeSingle();
      result.cedulaTaken = !!data;
    }
  } catch {
    /* best-effort — never block the form on a check failure */
  }

  return NextResponse.json(result);
}
