import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { outreachPendingProfessionals } from "@/lib/verification-notify";

// POST /api/admin/providers/outreach — send the first-contact verification notice
// (in-app + email) to everyone still pending, at most once per professional.
// WhatsApp is not sent from here: the owner writes those by hand from the queue.
export async function POST() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const result = await outreachPendingProfessionals();
  return NextResponse.json(result);
}
