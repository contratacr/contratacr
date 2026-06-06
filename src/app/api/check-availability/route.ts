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
      const { data } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
      result.emailTaken = !!data;
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
