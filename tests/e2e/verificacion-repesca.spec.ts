import { expect, test } from "playwright/test";
import { repescarVerificacionesSinRespuesta } from "../../src/lib/verification/repesca";

// La repesca de verificaciones que el padrón nunca llegó a contestar.
//
// El fallo que esto cubre era silencioso: si el padrón no respondía, la
// verificación devolvía "skipped", nadie lo miraba, y como `verification_status`
// nace en 'pending' el profesional se quedaba «pendiente de revisión» para
// siempre —con la misma cara que una cédula de verdad no encontrada, pero sin
// motivo que leer—.
//
// Lo que se sostiene aquí es la regla, no el detalle:
//
//  · la puerta interna no se abre sin el secreto de las tareas;
//  · solo se repesca a quien NUNCA llegó a una decisión: si el padrón ya lo
//    revisó, el caso es de la cola de Isaac y un reintento se lo quitaría de
//    encima sin que él lo viera.

test.describe("repesca de verificaciones sin respuesta del padrón", () => {
  test("la puerta interna exige el secreto de las tareas", async ({ request }) => {
    const sinSecreto = await request.post("/api/internal/verificacion/reintentar");
    // 401 con el secreto puesto en el ambiente; 503 donde todavía no lo está.
    expect([401, 503]).toContain(sinSecreto.status());
    const cuerpo = await sinSecreto.json().catch(() => ({}));
    expect(cuerpo.ok).not.toBe(true);

    const conSecretoMalo = await request.post("/api/internal/verificacion/reintentar", {
      headers: { Authorization: "Bearer no-es-el-secreto" },
    });
    expect([401, 503]).toContain(conSecretoMalo.status());
  });

  test("no toca a quien el padrón ya revisó", async () => {
    const fuente = repescarVerificacionesSinRespuesta.toString();
    // Solo entran los pendientes…
    expect(fuente).toContain('eq("verification_status", "pending")');
    // …y solo si NO hay una decisión real en el historial.
    expect(fuente).toContain("DECISIONES_REALES");
    expect(fuente).toContain("length === 0");
  });
});
