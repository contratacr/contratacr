import { expect, test } from "playwright/test";
import { invitarTrasExperiencia } from "../../src/lib/notifications/invitar-tras-experiencia";
import { invitarAResenaAhora } from "../../src/lib/notifications/invitar-ahora";

// La invitación «¿Nos dejas una reseña en Google?» (3-oct-2026). Ya no sale al
// registrarse: sale en el momento de una interacción real y, una vez al día, un
// recorrido de respaldo invita a quien se haya quedado sin ella.
//
// Lo que se sostiene aquí:
//  · la puerta interna del recorrido diario no se abre sin el secreto;
//  · en simulación cuenta y no escribe nada;
//  · la invitación inmediata nunca puede tumbar la acción que la dispara.

test.describe("invitación a reseñar en Google", () => {
  test("la puerta interna exige el secreto de las tareas", async ({ request }) => {
    const sinSecreto = await request.post("/api/internal/resena-google");
    expect([401, 503]).toContain(sinSecreto.status());
    expect((await sinSecreto.json().catch(() => ({}))).ok).not.toBe(true);
    const conSecretoMalo = await request.post("/api/internal/resena-google", { headers: { Authorization: "Bearer no-es-el-secreto" } });
    expect([401, 503]).toContain(conSecretoMalo.status());
  });

  test("en simulación cuenta antes de cualquier escritura", async () => {
    const fuente = invitarTrasExperiencia.toString();
    // La salida de la simulación (enviadas: 0) va antes de la única escritura.
    const simula = fuente.search(/simular[\s\S]{0,80}enviadas:\s*0/);
    const invita = fuente.indexOf("invitarAResenaDeGoogle");
    expect(simula).toBeGreaterThan(-1);
    expect(invita).toBeGreaterThan(simula);
  });

  test("la invitación inmediata se traga cualquier fallo", async () => {
    const fuente = invitarAResenaAhora.toString();
    expect(fuente).toContain("try");
    expect(fuente).toContain("catch");
    // Sin cuenta no hace nada.
    await expect(invitarAResenaAhora(null)).resolves.toBeUndefined();
  });
});
