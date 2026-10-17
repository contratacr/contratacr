import { expect, test } from "playwright/test";
import { gotoOK, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount } from "./disposable-account";

test("@seeded las ediciones del catálogo invalidan la caché pública y su ETag", async ({ page, request }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated test database.");
  const account = await createDisposableAccount({ prefix: "catalog-cache", admin: true });
  const db = regressionAdminClient();
  const id = `regression_cache_${Date.now()}`;
  const label = `Servicio caché ${Date.now()}`;
  try {
    const seeded = await db.from("categories").insert({ id, name: label, name_en: "Cache test service", group_id: "tecnologia", is_hidden: false });
    if (seeded.error) throw seeded.error;
    await resetAuth(page);
    await gotoOK(page, "/admin");
    await waitForInteractivePage(page);
    await page.getByPlaceholder(/Correo de administrador/i).fill(account.email);
    await page.getByPlaceholder(/Contrase.a|Contrasena/i).fill(account.password);
    await page.getByRole("button", { name: /Ingresar/i }).click();
    await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeHidden({ timeout: 20_000 });

    const update = async (name: string, isHidden = false) => {
      const response = await page.request.patch("/api/admin/categories", { data: { id, label: name, labelEn: "Cache test service", groupId: "tecnologia", isHidden } });
      expect(response.status(), await response.text()).toBe(200);
    };
    await update(label);
    const initial = await request.get("/api/categories/approved");
    expect(initial.status()).toBe(200);
    const initialTag = initial.headers().etag;
    expect(initialTag).toBeTruthy();
    expect((await initial.json()).categories.find((entry: { id: string }) => entry.id === id)?.label).toBe(label);
    const unchanged = await request.get("/api/categories/approved", { headers: { "If-None-Match": initialTag } });
    expect(unchanged.status()).toBe(304);

    await update(`${label} editado`);
    const edited = await request.get("/api/categories/approved", { headers: { "If-None-Match": initialTag } });
    expect(edited.status()).toBe(200);
    expect(edited.headers().etag).not.toBe(initialTag);
    expect((await edited.json()).categories.find((entry: { id: string }) => entry.id === id)?.label).toBe(`${label} editado`);
    await gotoOK(page, "/servicios");
    expect((await page.content()).includes(`${label} editado`), "The server-rendered catalogue must include the saved edit").toBe(true);

    await update(`${label} editado`, true);
    const hidden = await request.get("/api/categories/approved");
    expect((await hidden.json()).categories.some((entry: { id: string }) => entry.id === id)).toBe(false);
    const deleted = await page.request.delete(`/api/admin/categories?id=${id}`);
    expect(deleted.status()).toBe(200);
  } finally {
    await db.from("category_suggestions").delete().eq("id", id);
    await db.from("categories").delete().eq("id", id);
    await cleanupDisposableAccount(account);
  }
});
