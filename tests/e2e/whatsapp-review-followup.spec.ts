import { expect, test } from "playwright/test";

const followUp = {
  id: "00000000-0000-4000-8000-000000000134",
  professional_id: "00000000-0000-4000-8000-000000000001",
  professional_name: "SG Solutions",
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

  await page.goto("/es/como-funciona");
  const dialog = page.getByRole("dialog", { name: "Seguimiento del servicio" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Contactaste a SG Solutions por WhatsApp");
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
    { ...followUp, id: "00000000-0000-4000-8000-000000000201", professional_name: "SG Solutions" },
    { ...followUp, id: "00000000-0000-4000-8000-000000000202", professional_name: "Juan Electricidad", service_name: "Electricidad" },
  ];
  let getCount = 0;
  const actions: string[] = [];

  await page.route("**/api/contact/follow-up", async (route) => {
    if (route.request().method() === "GET") {
      const item = queue[Math.min(getCount, queue.length - 1)] ?? null;
      getCount += 1;
      await route.fulfill({ json: { followUp: item, pendingCount: item ? queue.length - Math.min(getCount - 1, queue.length - 1) : 0, authenticated: false } });
      return;
    }
    actions.push(String((route.request().postDataJSON() as { action?: string }).action ?? ""));
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/es/como-funciona");
  const dialog = page.getByRole("dialog", { name: "Seguimiento del servicio" });
  await expect(dialog).toContainText("1 de 2 confirmaciones pendientes");
  await expect(dialog).toContainText("SG Solutions");

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

  await page.goto("/es/como-funciona");
  await page.getByRole("button", { name: "Sí, dejar una reseña" }).click();
  await expect(page).toHaveURL(/\/es\/login$/);
});
