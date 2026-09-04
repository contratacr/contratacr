import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { suggestEnglishServiceLabel, suggestSpanishServiceLabel } from "@/lib/translation/service-labels";

export async function POST(req: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const target = body.target === "es" ? "es" : "en";
  if (!text) return NextResponse.json(target === "es" ? { labelEs: "" } : { labelEn: "" });

  // Sin credenciales el traductor cae a un diccionario local que, ante una
  // palabra que no conoce, devuelve el mismo español. Se informa para que el
  // panel lo diga en voz alta en vez de aparentar una traducción.
  const configurado = Boolean(process.env.GOOGLE_TRANSLATE_API_KEY?.trim() || process.env.GOOGLE_CLOUD_PROJECT_ID?.trim());

  if (target === "es") {
    const labelEs = await suggestSpanishServiceLabel(text);
    return NextResponse.json({ labelEs, configurado });
  }
  const labelEn = await suggestEnglishServiceLabel(text);
  return NextResponse.json({ labelEn, configurado });
}
