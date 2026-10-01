/**
 * Aviso por correo desde GitHub Actions cuando una tarea programada falla.
 *
 * GitHub manda su propio correo solo a quien disparó la corrida, y para las
 * programadas eso es quien tocó el archivo por última vez: no llega a la
 * bandeja de soporte. Este aviso sale por Brevo, el mismo proveedor de los
 * correos del app, a la dirección de ALERTAS_CORREO (por omisión, la bandeja
 * de soporte).
 *
 * Uso: node scripts/ci/avisar-por-correo.mjs "<asunto>" "<detalle>"
 * Env: BREVO_API_KEY (obligatoria), ALERTAS_CORREO (opcional),
 *      CORRIDA (enlace a la corrida, opcional).
 *
 * Nunca falla el flujo: si Brevo no responde, lo dice y sale con 0, porque una
 * falla aquí taparía la falla de verdad, que ya quedó en el registro.
 */

const [asunto = "ContrataCR: una revisión automática falló", detalle = ""] = process.argv.slice(2);
const llave = process.env.BREVO_API_KEY;
const destino = process.env.ALERTAS_CORREO || "soporte@contratacr.com";
const corrida = process.env.CORRIDA || "";

if (!llave) {
  console.log("::warning::BREVO_API_KEY no está en este ambiente; el aviso queda solo en el correo de GitHub.");
  process.exit(0);
}

const escapar = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cuerpo = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#162543">
    <p style="font-size:18px;font-weight:700;margin:0 0 12px">🔴 ${escapar(asunto)}</p>
    <pre style="white-space:pre-wrap;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f7fa;border-radius:12px;padding:14px;margin:0 0 16px">${escapar(detalle || "Sin más detalle; el registro completo está en la corrida.")}</pre>
    ${corrida ? `<p><a href="${escapar(corrida)}" style="color:#0089bb;font-weight:700">Ver la corrida en GitHub</a></p>` : ""}
    <p style="font-size:12px;color:#68778d">Aviso automático de las revisiones de ContrataCR.</p>
  </div>`;

try {
  const respuesta = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": llave, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Revisiones ContrataCR", email: "soporte@contratacr.com" },
      to: [{ email: destino }],
      subject: asunto,
      htmlContent: cuerpo,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  console.log(respuesta.ok ? `Aviso enviado a ${destino}.` : `::warning::Brevo respondió ${respuesta.status}: ${await respuesta.text()}`);
} catch (error) {
  console.log(`::warning::No se pudo mandar el aviso: ${error instanceof Error ? error.message : String(error)}`);
}
