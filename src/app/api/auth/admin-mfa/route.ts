import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/auth/admin";
export async function GET() {
  const state = await getAdminAccess();
  return NextResponse.json({
    authenticated: state.authenticated,
    isAdmin: Boolean(state.admin || state.mfaRequired),
    required: state.mfaRequired,
    enrolled: state.enrolled,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
