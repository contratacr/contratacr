import { expect, test } from "playwright/test";

// El aviso de seguimiento solo se consulta si la visita YA contactó a alguien:
// o hay sesión, o quedó la marca en la cookie. Sin esa marca no se pedía nada y
// estas pruebas fallaban sin que hubiera nada roto en el producto.
async function marcarContactoPrevio(page: import("playwright/test").Page, info: import("playwright/test").TestInfo) {
  const base = String((info.project.use as { baseURL?: string }).baseURL ?? "http://localhost:3000");
  await page.context().addCookies([{ name: "ccr_whatsapp_contact", value: "e2e", url: base }]);
}

const followUp = {
  id: "00000000-0000-4000-8000-000000000134",
  professional_id: "00000000-0000-4000-8000-000000000001",
  professional_name: "Redes Bahía",
  service_name: "Reparación de computadoras",
  contact_method: "whatsapp",
  status: "contacted",
  contacted_at: new Date().toISOString(),
};

test("contact follow-up is readable and dismissible without blocking the page", async ({ page }) => {
  let action = "";
  await page.route("**/api/contact/follow-up", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { followUp, pendingCount: 1, authenticated: false } });
      return;
    }
    action = String((route.request().postDataJSON() as { action?: string }).action ?? "");
    await route.fulfill({ json: { ok: true } });
  });

  await marcarContactoPrevio(page, test.info());
  await page.goto("/es/como-funciona");
  const dialog = page.getByRole("dialog", { name: "Seguimiento del servicio" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Contactaste a Redes Bahía por WhatsApp");
  await expect(dialog).toContainText("¿Llegaste a contratarlo?");
  await expect(dialog).toContainText("Reparación de computadoras");
  await expect(dialog.getByRole("button", { name: "Sí, dejar una reseña" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Aún no" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "No", exact: true })).toBeVisible();

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  await dialog.getByRole("button", { name: "Aún no" }).click();
  await expect(dialog).toBeHidden();
  expect(action).toBe("not_now");
});

test("contact follow-up shows pending confirmations one at a time", async ({ page }) => {
  const queue = [
    { ...followUp, id: "00000000-0000-4000-8000-000000000201", professional_name: "Redes Bahía" },
    { ...followUp, id: "00000000-0000-4000-8000-000000000202", professional_name: "Juan Electricidad", service_name: "Electricidad" },
  ];
  let queueIndex = 0;
  const actions: string[] = [];

  await page.route("**/api/contact/follow-up", async (route) => {
    if (route.request().method() === "GET") {
      const item = queue[queueIndex] ?? null;
      await route.fulfill({ json: { followUp: item, pendingCount: item ? queue.length - queueIndex : 0, authenticated: false } });
      return;
    }
    actions.push(String((route.request().postDataJSON() as { action?: string }).action ?? ""));
    queueIndex += 1;
    await route.fulfill({ json: { ok: true } });
  });

  await marcarContactoPrevio(page, test.info());
  await page.goto("/es/como-funciona");
  const dialog = page.getByRole("dialog", { name: "Seguimiento del servicio" });
  await expect(dialog).toContainText("1 de 2 confirmaciones pendientes");
  await expect(dialog).toContainText("Redes Bahía");

  await dialog.getByRole("button", { name: "Aún no" }).click();
  await expect(dialog).toContainText("Juan Electricidad", { timeout: 2000 });
  await expect(dialog).toContainText("Electricidad");
  expect(actions).toEqual(["not_now"]);
});

test("contact follow-up names phone and email contact methods", async ({ page }) => {
  const methods = [
    { contact_method: "phone", text: "por llamada" },
    { contact_method: "email", text: "por correo" },
  ];

  for (const method of methods) {
    await page.route("**/api/contact/follow-up", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { followUp: { ...followUp, contact_method: method.contact_method }, pendingCount: 1, authenticated: false } });
        return;
      }
      await route.fulfill({ json: { ok: true } });
    });

    await marcarContactoPrevio(page, test.info());
  await page.goto("/es/como-funciona");
    await expect(page.getByRole("dialog", { name: "Seguimiento del servicio" })).toContainText(method.text);
    await page.unroute("**/api/contact/follow-up");
  }
});

test("an anonymous review intent continues through login", async ({ page }) => {
  await page.route("**/api/contact/follow-up", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { followUp, pendingCount: 1, authenticated: false } });
      return;
    }
    await route.fulfill({ status: 401, json: { authRequired: true } });
  });

  await marcarContactoPrevio(page, test.info());
  await page.goto("/es/como-funciona");
  await page.getByRole("button", { name: "Sí, dejar una reseña" }).click();
  await expect(page).toHaveURL(/\/es\/login$/);
});

// Reseñar sin cuenta: quien contactó desde ESTE dispositivo puede publicar su
// reseña dando solo el nombre. Lo que se protege es la cadena: sin la cookie del
// contacto, la ruta no acepta nada.
test("la reseña sin cuenta exige la cookie del contacto", async ({ page }) => {
  await page.goto("/es/como-funciona");
  const sinCookie = await page.evaluate(async () => {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professionalId: "00000000-0000-4000-8000-000000000001",
        rating: 5,
        comment: "Intento sin haber contactado a nadie desde este dispositivo.",
        contactId: "00000000-0000-4000-8000-000000000134",
        clientName: "Alguien",
      }),
    });
    return res.status;
  });
  expect(sinCookie).toBe(401);

  // Con cookie, pero apuntando a un seguimiento que no existe: tampoco pasa.
  await page.context().addCookies([
    { name: "ccr_whatsapp_contact", value: "11111111-1111-4111-8111-111111111111", url: String((test.info().project.use as { baseURL?: string }).baseURL ?? "http://localhost:3000") },
  ]);
  const conCookieAjena = await page.evaluate(async () => {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professionalId: "00000000-0000-4000-8000-000000000001",
        rating: 5,
        comment: "Intento con una cookie que no abrió ese seguimiento.",
        contactId: "00000000-0000-4000-8000-000000000134",
        clientName: "Alguien",
      }),
    });
    return res.status;
  });
  expect(conCookieAjena).toBe(401);
});
