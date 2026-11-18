import { expect, test } from "playwright/test";
import { textoCompletarPerfil } from "../../src/lib/notifications/completar-perfil-texto";
import { avatarGeometry } from "../../src/components/ui/avatar-file-input";

// 18-nov-2026: el aviso "Completa tu perfil" nombra solo lo que falta, y la
// foto de perfil siempre llena el círculo (sin franjas blancas a los lados).
test("@contract the profile reminder names only what is missing", () => {
  expect(textoCompletarPerfil(["descripcion"], "es")).toBe("Agrega una descripción para que los clientes conozcan lo que ofreces.");
  expect(textoCompletarPerfil(["foto", "servicios"], "es")).toBe("Agrega tu foto y tus servicios para que los clientes conozcan lo que ofreces.");
  expect(textoCompletarPerfil(["foto", "descripcion", "servicios"], "en")).toBe("Add your photo, a description and your services so clients can learn what you offer.");
});

test("@contract a portrait photo covers the whole circle and cannot be dragged off it", () => {
  const g = avatarGeometry(1000, 1500, 1, 5, -5);
  expect(g.w).toBe(1);
  expect(g.h).toBeCloseTo(1.5);
  expect(g.x).toBe(0);
  expect(g.y).toBeCloseTo(-0.25);
  // Con más zoom se puede mover, pero nunca hasta dejar un borde dentro.
  const z = avatarGeometry(1000, 1500, 2, 5, 5);
  expect(z.x).toBeCloseTo(0.5);
  expect(z.y).toBeCloseTo(1);
});
