// Trabajo que NO tiene que hacer esperar a quien mandó la petición: correos,
// push, auditoría. En el Worker de Cloudflare se registra con `waitUntil`, que
// mantiene vivo el contexto hasta que termina aunque la respuesta ya se haya
// enviado; fuera del Worker (next dev / next start) simplemente queda suelto.
//
// Regla: solo para efectos secundarios. Nada cuyo resultado necesite la
// respuesta ni cuya falla deba devolver un error al usuario.
export function despuesDeResponder(work: Promise<unknown>, etiqueta: string): void {
  const seguro = Promise.resolve(work).catch((error) => {
    console.error(`[after-response] ${etiqueta} falló:`, error);
  });
  void (async () => {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      // Síncrono a propósito: dentro del Worker el contexto ya está en el
      // ámbito global, y la variante async levantaría un proxy de wrangler
      // bajo `next dev`/`next start`. Fuera del Worker lanza y no pasa nada:
      // la promesa ya corre por su cuenta.
      getCloudflareContext().ctx.waitUntil(seguro);
    } catch {
      /* sin Worker: la promesa ya está en marcha */
    }
  })();
}
