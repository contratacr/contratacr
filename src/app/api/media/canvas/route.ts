import { NextResponse } from "next/server";

/**
 * Sirve una imagen de nuestros CDN desde el mismo origen para poder dibujarla
 * en un canvas exportable (la tarjeta con QR). assets.contratacr.com no manda
 * cabeceras CORS, y una imagen ajena "contamina" el canvas y bloquea la
 * exportación. Solo acepta nuestros hosts.
 */
const HOSTS = new Set(["assets.contratacr.com", "res.cloudinary.com"]);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  let target: URL;
  try { target = new URL(raw); } catch { return NextResponse.json({ error: "url" }, { status: 400 }); }
  if (target.protocol !== "https:" || !HOSTS.has(target.hostname)) return NextResponse.json({ error: "host" }, { status: 400 });
  const upstream = await fetch(target.toString(), { headers: { Accept: "image/*" }, next: { revalidate: 3600 } });
  if (!upstream.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) return NextResponse.json({ error: "type" }, { status: 415 });
  return new NextResponse(await upstream.arrayBuffer(), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
