import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * EL ENLACE DE BAJA QUE ABRE EL BUZÓN, NO LA PERSONA.
 *
 * Gmail y Yahoo exigen `List-Unsubscribe` a quien manda correo en volumen, y
 * con `List-Unsubscribe-Post` el buzón puede dar de baja SOLO —sin abrir nada,
 * sin pedirle nada a nadie. Por eso la dirección tiene que poder identificar a
 * quién dar de baja sin sesión: el que la llama es el servidor de Gmail.
 *
 * Y por eso lleva firma. Sin ella, la dirección sería `?correo=quien@sea` y
 * cualquiera podría dar de baja a cualquiera con solo cambiar el texto. La
 * firma es un HMAC del correo: se puede comprobar, pero no se puede inventar
 * para un correo ajeno.
 *
 * La llave sale de `EMAIL_BAJA_SECRET` si está puesta; si no, de la llave de
 * servicio, que ya es secreta y estable. Así esto funciona sin configurar nada
 * nuevo, y si algún día se rota, lo único que se pierde son los enlaces de
 * correos viejos.
 */
function llave() {
  return process.env.EMAIL_BAJA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function normalizarCorreo(valor: string) {
  return valor.trim().toLowerCase();
}

export function firmaDeBaja(correo: string) {
  const k = llave();
  if (!k) return "";
  return createHmac("sha256", k).update(normalizarCorreo(correo)).digest("base64url").slice(0, 32);
}

export function firmaValida(correo: string, firma: string) {
  const esperada = firmaDeBaja(correo);
  if (!esperada || !firma || esperada.length !== firma.length) return false;
  // Comparación de tiempo constante: comparar con `===` filtra, carácter a
  // carácter, cuánto acertó quien prueba.
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(firma));
}

/** La dirección que viaja en la cabecera y en el pie del correo. */
export function enlaceDeBaja(origen: string, correo: string) {
  const base = origen.replace(/\/$/, "");
  return `${base}/api/email/baja?c=${encodeURIComponent(normalizarCorreo(correo))}&f=${firmaDeBaja(correo)}`;
}
