import { NextResponse } from "next/server";

// Insurer suggestions are intentionally disabled for now. ContrataCR uses a
// closed, curated insurer list so the admin does not need to moderate duplicate
// or informal insurer names.
export async function POST() {
  return NextResponse.json(
    { error: "Las sugerencias de aseguradoras no estan habilitadas." },
    { status: 410 }
  );
}
