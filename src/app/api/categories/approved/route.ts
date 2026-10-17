import { NextResponse } from "next/server";
import { getApprovedCatalog } from "@/lib/data/approved-catalog-cache";

// GET /api/categories/approved — public custom services + catalog overrides.
// The operational catalog is the `categories` table. Approved suggestions are
// kept as a compatibility source for older rows that have not been mirrored yet.
export async function GET(request: Request) {
  const catalog = await getApprovedCatalog();
  const body = JSON.stringify(catalog);
  const etag = `W/"${await digest(body)}"`;
  // Admin catalog edits should appear immediately on public service surfaces:
  // "no-cache" makes every read revalidate, and the ETag turns the unchanged
  // case (every app start, every return to the tab) into a 304 without body.
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", Vary: "Accept-Encoding" };
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
