import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { translatePlainTexts } from "@/lib/translation/service-labels";

export async function POST(req: Request) {
  // Public endpoint: bound abuse and enumeration per client IP.
  const limited = enforceRateLimit(req, "translate", 20, 60000);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const target = body.target === "es" ? "es" : "en";
  const source = body.source === "en" || body.source === "es" ? body.source : undefined;
  const rawTexts: unknown[] = Array.isArray(body.texts)
    ? body.texts
    : typeof body.text === "string"
      ? [body.text]
      : [];

  const texts = rawTexts
    .filter((text): text is string => typeof text === "string")
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((text) => text.slice(0, 1200));

  if (texts.length === 0) return NextResponse.json({ translations: [] });

  const translations = await translatePlainTexts(texts, target, source);
  return NextResponse.json({ translations });
}
