/**
 * ¿ESTE NÚMERO PUEDE TENER WHATSAPP? (3-oct-2026)
 *
 * No hay forma de saber si un número está en WhatsApp: Meta no lo expone. Lo
 * que SÍ se sabe es el plan de numeración de Costa Rica: los celulares
 * empiezan con 5, 6, 7 u 8; los fijos con 2 (y 4 son líneas de servicio).
 * Un fijo nunca tiene WhatsApp, y era el error más común: el profesional
 * tocaba «WhatsApp» y llegaba a «este número no está en WhatsApp».
 * Números de otros países no se juzgan.
 */
export function pareceFijoDeCostaRica(valor: string | null | undefined): boolean {
  const d = String(valor ?? "").replace(/\D/g, "");
  const nacional = d.length === 11 && d.startsWith("506") ? d.slice(3) : d.length === 8 ? d : null;
  return !!nacional && /^[24]/.test(nacional);
}
