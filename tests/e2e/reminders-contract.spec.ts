import { expect, test } from "playwright/test";

// El endpoint de recordatorios solo lo llama la tarea programada con la llave
// del worker. Este contrato asegura que nadie pueda dispararlo desde afuera:
// sin llave configurada responde 503, con una llave equivocada 401, y nunca corre.
test.describe("inactivity reminders contract", () => {
  for (const method of ["GET", "POST"] as const) {
    test(`${method} without the worker key never runs the reminders`, async ({ request }) => {
      const response = await request.fetch("/api/internal/recordatorios", {
        method,
        headers: { authorization: "Bearer not-the-worker-key" },
      });

      expect([401, 503]).toContain(response.status());
      const body = (await response.json()) as { ok?: boolean; error?: string };
      expect(body.ok).toBe(false);
      expect(["unauthorized", "reminder_worker_not_configured"]).toContain(body.error);
    });
  }
});
