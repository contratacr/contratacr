import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument } from "@/lib/email/send";
import { escaparHtml } from "@/lib/email/escape";
import { anotarReporte, reporteValido, RESPUESTAS } from "@/lib/notifications/resumen-semanal";

/**
 * «¿CON CUÁNTAS CERRASTE TRABAJO?» — LA RESPUESTA DEL CORREO DEL LUNES.
 *
 * GET muestra la pregunta con la respuesta tocada y un botón para confirmarla;
 * solo el POST la anota. Los antivirus del correo abren los enlaces solos, y si
 * el GET anotara, cada correo llegaría «respondido» con lo que tocó el robot.
 * No hay sesión: lo que autoriza es la firma del enlace (profesional + semana).
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");

function leer(params: URLSearchParams) {
  const p = params.get("p") ?? "";
  const s = params.get("s") ?? "";
  const n = Number(params.get("n"));
  const f = params.get("f") ?? "";
  const ok = /^[0-9a-f-]{36}$/i.test(p) && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && (RESPUESTAS as readonly number[]).includes(n) && reporteValido(p, s, f);
  return { p, s, n, f, ok };
}

function pagina(titulo: string, cuerpo: string, status = 200) {
  const html = brandedEmailDocument({
    title: titulo,
    origin: APP_URL,
    bodyHtml: `<h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:#162543">${escaparHtml(titulo)}</h1>${cuerpo}`,
  }).replace("<head>", '<head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">');
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const texto = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">${t}</p>`;
const etiqueta = (n: number) => (n === 3 ? "3 o más" : String(n));

export async function GET(request: Request) {
  const { p, s, n, f, ok } = leer(new URL(request.url).searchParams);
  if (!ok) return pagina("Este enlace no es válido", texto("Puede que haya cambiado. Si quieres contarnos, escríbenos a soporte@contratacr.com."), 400);
  const accion = `/api/trabajos/reportar?${new URLSearchParams({ p, s, n: String(n), f }).toString()}`;
  return pagina(
    "¿Con cuántas cerraste trabajo?",
    `${texto(`Vas a anotar: <strong>${etiqueta(n)}</strong>.`)}
     <form method="post" action="${escaparHtml(accion)}" style="margin:18px 0 0">
       <button type="submit" style="display:inline-block;padding:13px 26px;border:0;border-radius:999px;background:#009FD9;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Confirmar</button>
     </form>`,
  );
}

export async function POST(request: Request) {
  const { p, s, n, ok } = leer(new URL(request.url).searchParams);
  if (!ok) return pagina("Este enlace no es válido", texto("Puede que haya cambiado. Si quieres contarnos, escríbenos a soporte@contratacr.com."), 400);
  try {
    const anotado = await anotarReporte(createAdminClient(), p, s, n);
    if (!anotado) return pagina("No encontramos ese resumen", texto("Puede que sea de una semana vieja. Gracias igual por contarnos."), 404);
  } catch (err) {
    console.error("[trabajos/reportar]", err);
    return pagina("No pudimos guardarlo", texto("Intenta de nuevo en un momento."), 500);
  }
  return pagina(
    "¡Gracias!",
    `${texto(`Anotamos <strong>${etiqueta(n)}</strong>. Nos ayuda a saber qué está funcionando para traerte más clientes.`)}
     <p style="margin:18px 0 0"><a href="${APP_URL}/dashboard/profesional" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#009FD9;color:#fff;text-decoration:none;font-weight:700;font-size:15px">Ir a mi panel</a></p>`,
  );
}
