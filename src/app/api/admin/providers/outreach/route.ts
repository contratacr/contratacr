import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { outreachPendingProfessionals } from "@/lib/verification-notify";

// POST /api/admin/providers/outreach — send the first-contact verification notice
// to everyone still pending (each channel at most once per professional).
export async function POST() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const result = await outreachPendingProfessionals();
  return NextResponse.json({ ...result, whatsappConfigured: !!process.env.WHATSAPP_VERIFICATION_TEMPLATE && !!process.env.WHATSAPP_CLOUD_TOKEN });
}
