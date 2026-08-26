import { NextRequest, NextResponse } from "next/server";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { redactContact } from "@/lib/contact/redact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const pro = await getProfessionalBySlug(slug);
  if (!pro) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  // Phone numbers and email travel only to signed-in viewers.
  const viewer = await createClient().then((supabase) => safeGetUser(supabase)).catch(() => null);
  return NextResponse.json(redactContact(pro, !!viewer), { headers: { "Cache-Control": "no-store" } });
}
