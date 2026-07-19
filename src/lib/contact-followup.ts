import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const WHATSAPP_CONTACT_COOKIE = "ccr_whatsapp_contact";

export function hashContactToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function contactCookieValue(request: NextRequest) {
  const existing = request.cookies.get(WHATSAPP_CONTACT_COOKIE)?.value;
  return existing && /^[a-f0-9-]{30,50}$/i.test(existing) ? existing : randomUUID();
}

export function setContactCookie(response: NextResponse, token: string) {
  response.cookies.set(WHATSAPP_CONTACT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}
