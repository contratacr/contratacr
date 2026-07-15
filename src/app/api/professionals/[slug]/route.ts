import { NextRequest, NextResponse } from "next/server";
import { getProfessionalBySlug } from "@/lib/queries/professionals";

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
  return NextResponse.json(pro, { headers: { "Cache-Control": "no-store" } });
}
