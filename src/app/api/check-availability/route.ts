import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Lightweight existence checks for inline, real-time validation of the email
// and cedula fields during registration / booking.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim();
  const cedula = searchParams.get("cedula")?.replace(/\D/g, "");

  const admin = createAdminClient();
  const result: { emailTaken?: boolean; cedulaTaken?: boolean } = {};

  try {
    if (email) {
      const { data: providers } = await admin.rpc("auth_providers_for_email", { p_email: email });

      if (providers) {
        result.emailTaken = true;
      } else {
        // profiles.email is only a mirror. Confirm a matching profile still
        // belongs to an auth user with this email before claiming it is taken.
        const { data: rows } = await admin.from("profiles").select("id").ilike("email", email);
        let taken = false;

        for (const row of (rows ?? []) as { id: string }[]) {
          try {
            const { data: au } = await admin.auth.admin.getUserById(row.id);
            if (au?.user?.email && au.user.email.toLowerCase() === email.toLowerCase()) {
              taken = true;
              break;
            }
          } catch {
            // Best effort: do not claim taken on a transient lookup error.
          }
        }

        result.emailTaken = taken;
      }
    }

    if (cedula && cedula.length >= 9) {
      const { data } = await admin.from("profiles").select("id").eq("cedula", cedula).maybeSingle();
      result.cedulaTaken = !!data;
    }
  } catch {
    // Best effort: never block the form on a check failure.
  }

  return NextResponse.json(result);
}
