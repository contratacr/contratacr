/**
 * Texto de una persona dentro de un correo HTML.
 *
 * Los correos internos (reportes, soporte) interpolaban el nombre, el correo,
 * el asunto y hasta el nombre de un archivo subido directamente en el HTML. Un
 * reporte es público, así que cualquiera podía mandar etiquetas y cambiar cómo
 * se ve el correo que lee el equipo, incluido el destino de un enlace.
 *
 * Escapa los cinco caracteres que importan, también dentro de un atributo.
 */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Un correo que se usa como `replyTo` tiene que parecer un correo. */
export function correoValido(valor: unknown): string {
  const limpio = String(valor ?? "").trim();
  return /^[^\s@<>"']{1,64}@[^\s@<>"'.]+(\.[^\s@<>"'.]+)+$/.test(limpio) ? limpio : "";
}
