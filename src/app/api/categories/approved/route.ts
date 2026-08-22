import { NextResponse } from "next/server";
import { buildApprovedCatalog } from "@/lib/data/approved-catalog";

// GET /api/categories/approved — public custom services + catalog overrides.
// The operational catalog is the `categories` table. Approved suggestions are
// kept as a compatibility source for older rows that have not been mirrored yet.
export async function GET() {
  const catalog = await buildApprovedCatalog();
  return NextResponse.json(
    catalog,
    // Admin catalog edits should appear immediately on public service surfaces.
    { headers: { "Cache-Control": "no-store" } }
  );
}
