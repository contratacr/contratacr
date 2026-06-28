import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { suggestEnglishServiceLabel } from "@/lib/translation/service-labels";

export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ labelEn: "" });

  const labelEn = await suggestEnglishServiceLabel(text);
  return NextResponse.json({ labelEn });
}
