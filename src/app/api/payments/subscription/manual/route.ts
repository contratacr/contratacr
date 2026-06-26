import { NextResponse } from "next/server";

// Legacy placeholder. The planned public subscription launch is card-only
// automatic billing, so manual SINPE/comprobante submissions are disabled.
export async function POST() {
  return NextResponse.json({ error: "Pago manual no disponible" }, { status: 404 });
}
