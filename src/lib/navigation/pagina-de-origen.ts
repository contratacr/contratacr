import { headers } from "next/headers";
import { rutaInternaSegura } from "@/lib/navigation/ruta-interna";

/**
 * La página de este mismo sitio que abrió la actual (cabecera Referer), para
 * que la flecha de atrás de un formulario a pantalla completa vuelva ahí.
 * Nunca a pantallas de entrada ni a otro formulario.
 */
const NO_SE_VUELVE_A = /^\/(?:en\/)?(?:login|registro|onboarding|publicar-proyecto|cotizar|auth)(?:[/?]|$)/;

export async function paginaDeOrigen(): Promise<string | null> {
  const h = await headers();
  const referer = h.get("referer");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!referer || !host) return null;
  try {
    const url = new URL(referer);
    if (url.host !== host) return null;
    const ruta = rutaInternaSegura(url.pathname + url.search);
    if (!ruta || NO_SE_VUELVE_A.test(ruta)) return null;
    return ruta.replace(/^\/es(?=\/|$)/, "") || "/";
  } catch {
    return null;
  }
}
