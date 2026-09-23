import { expect, test } from "playwright/test";
import { cerrarCasosSinRespuesta, DIAS_DE_SILENCIO } from "../../src/lib/support/cierre-por-silencio";

// El cierre automático de casos en silencio: siete días DESPUÉS de una
// respuesta de soporte. Lo que se sostiene aquí es la regla, no el detalle del
// mensaje —ese es el mismo del cierre a mano, y lo cubre la suite de soporte—:
//
//  · la puerta interna no se abre sin el secreto de las tareas;
//  · un caso cuyo último mensaje es del USUARIO no se cierra nunca, porque ahí
//    la pelota es nuestra y cerrarlo sería echarlo.

test.describe("cierre de casos de soporte en silencio", () => {
  test("la puerta interna exige el secreto de las tareas", async ({ request }) => {
    const sinSecreto = await request.post("/api/internal/soporte/cerrar-sin-respuesta");
    // 401 con el secreto puesto en el ambiente; 503 donde todavía no lo está.
    expect([401, 503]).toContain(sinSecreto.status());
    const cuerpo = await sinSecreto.json().catch(() => ({}));
    expect(cuerpo.ok).not.toBe(true);

    const conSecretoMalo = await request.post("/api/internal/soporte/cerrar-sin-respuesta", {
      headers: { Authorization: "Bearer no-es-el-secreto" },
    });
    expect([401, 503]).toContain(conSecretoMalo.status());
  });

  test("espera una semana y solo cuando la pelota es del usuario", async () => {
    expect(DIAS_DE_SILENCIO).toBe(7);
    // La consulta filtra por `last_reply_role: "admin"`: un caso con la última
    // palabra del usuario queda fuera del lote, y por eso nunca se cierra solo.
    const fuente = cerrarCasosSinRespuesta.toString();
    expect(fuente).toContain('eq("last_reply_role", "admin")');
    expect(fuente).toContain('in("status", ["open", "in_progress"])');
  });
});
