import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmaValida, normalizarCorreo } from "@/lib/email/baja";

/**
 * DARSE DE BAJA DE LAS NOVEDADES.
 *
 * Dos entradas, porque hay dos visitantes distintos:
 *
 * - `POST` lo llama el SERVIDOR DE GMAIL, sin que nadie mire nada: es el
 *   botón «Cancelar suscripción» que el buzón pinta arriba del mensaje. Tiene
 *   que dar de baja de una, sin página intermedia ni confirmación; eso es lo
 *   que pide `List-Unsubscribe-Post` (RFC 8058) y lo que Gmail verifica.
 * - `GET` lo abre una PERSONA que tocó el enlace del pie. Da de baja y la
 *   manda a una pantalla que se lo confirma.
 *
 * No hay sesión que revisar: quien llama puede ser un servidor ajeno. Lo que
 * autoriza es la firma del correo (ver `@/lib/email/baja`).
 */

async function darDeBaja(url: URL, motivo: string) {
  const correo = normalizarCorreo(url.searchParams.get("c") ?? "");
  const firma = url.searchParams.get("f") ?? "";
  if (!correo.includes("@") || !firmaValida(correo, firma)) return false;

  const db = createAdminClient();
  // `upsert` y no `insert`: darse de baja dos veces no es un error, y la
  // primera fecha es la que vale.
  const { error } = await db
    .from("email_bajas")
    .upsert({ correo, motivo }, { onConflict: "correo", ignoreDuplicates: true });
  if (error) {
    console.error("[baja-correos] no se pudo guardar:", error.message);
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  const ok = await darDeBaja(new URL(request.url), "un-clic");
  // Al buzón se le contesta 200 aunque la firma no cuadre: un error lo haría
  // reintentar y marcaría el remitente como poco confiable.
  return NextResponse.json({ ok });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ok = await darDeBaja(url, "enlace");
  const idioma = url.pathname.startsWith("/en") ? "en" : "es";
  return NextResponse.redirect(new URL(`/${idioma}/baja-correos?ok=${ok ? "1" : "0"}`, url.origin));
}
