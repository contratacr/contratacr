import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Una sola puerta para todo el correo del app.
 *
 * El plan gratuito de Brevo son 300 al día, y ese mismo cupo lo comparten los
 * correos que el app NECESITA mandar con los que solo son útiles y con una
 * campaña. Sin contador, una campaña de 200 se come el día y a la persona 201
 * que crea una cuenta no le llega el código: se queda afuera sin que nadie se
 * entere. Por eso cada nivel se corta a distinta altura.
 */
export const TOPE_DIARIO = 300;

export type NivelDeCorreo = "critico" | "normal" | "masivo";

/**
 * Cuántos correos tienen que quedar libres para que este nivel siga enviando.
 *
 *  · `critico` NUNCA se corta: crear cuenta, recuperar contraseña, verificación
 *    y soporte. Si estos no salen, alguien se queda sin entrar.
 *  · `normal` se corta con 40 libres: los avisos del app. Molesta perderlos,
 *    pero nadie se queda afuera.
 *  · `masivo` se corta con 100 libres: campañas. Son lo primero que cede, y con
 *    holgura, porque son las que pueden vaciar el día de golpe.
 */
const RESERVA: Record<NivelDeCorreo, number> = {
  critico: 0,
  normal: 40,
  masivo: 100,
};

function diaDeCostaRica(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type ResumenDeCuota = {
  dia: string;
  tope: number;
  enviados: number;
  porNivel: Record<NivelDeCorreo, number>;
  restantes: number;
  /** Cuántos quedan ANTES de que cada nivel deje de enviar. */
  margenPorNivel: Record<NivelDeCorreo, number>;
  /** El nivel más alto que todavía puede enviar. */
  puedeEnviar: Record<NivelDeCorreo, boolean>;
};

export async function resumenDeCuota(): Promise<ResumenDeCuota> {
  const dia = diaDeCostaRica();
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_cuota_diaria")
    .select("nivel, enviados")
    .eq("dia", dia);

  const porNivel: Record<NivelDeCorreo, number> = { critico: 0, normal: 0, masivo: 0 };
  for (const fila of data ?? []) {
    const nivel = fila.nivel as NivelDeCorreo;
    if (nivel in porNivel) porNivel[nivel] = Number(fila.enviados ?? 0);
  }
  const enviados = porNivel.critico + porNivel.normal + porNivel.masivo;
  const restantes = Math.max(0, TOPE_DIARIO - enviados);

  const margenPorNivel = {
    critico: restantes,
    normal: Math.max(0, restantes - RESERVA.normal),
    masivo: Math.max(0, restantes - RESERVA.masivo),
  };

  return {
    dia,
    tope: TOPE_DIARIO,
    enviados,
    porNivel,
    restantes,
    margenPorNivel,
    puedeEnviar: {
      critico: true,
      normal: margenPorNivel.normal > 0,
      masivo: margenPorNivel.masivo > 0,
    },
  };
}

/**
 * ¿Sale este correo? Un `critico` sale SIEMPRE, incluso pasado el tope: si el
 * proveedor lo rechaza, al menos el app lo intentó y queda en el registro; que
 * alguien no pueda entrar a su cuenta es peor que un envío fallido.
 */
export async function hayCupoPara(nivel: NivelDeCorreo): Promise<boolean> {
  if (nivel === "critico") return true;
  try {
    const resumen = await resumenDeCuota();
    return resumen.puedeEnviar[nivel];
  } catch {
    // Si no se puede leer el contador, no se bloquea nada: un contador caído no
    // puede dejar al app sin mandar correo.
    return true;
  }
}

/** Suma uno al contador del día. Nunca lanza: contar no puede tumbar un envío. */
export async function registrarEnvio(nivel: NivelDeCorreo): Promise<void> {
  try {
    await createAdminClient().rpc("registrar_envio_de_correo", { p_nivel: nivel });
  } catch {
    /* el envío ya salió; perder la cuenta de uno no justifica un error */
  }
}
