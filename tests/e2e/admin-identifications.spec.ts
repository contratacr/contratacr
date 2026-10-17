import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { loginAs, expectNoHorizontalOverflow } from "./helpers";

test("identification tools reject anonymous requests without returning pending records", async ({ request }) => {
  expect((await request.get("/api/admin/identificaciones")).status()).toBe(403);
  for (const path of ["/api/admin/identificaciones", "/api/admin/identificaciones/verificar"]) {
    const response = await request.post(path, { data: {} });
    expect(response.status()).toBe(403); expect(await response.text()).not.toContain("accountId");
  }
});
test("administrator can consult all ID types and review a missing-document case without approving it", async ({ page }) => {
  test.setTimeout(120000);
  const accounts: DisposableAccount[] = [];
  try {
    const admin = await createDisposableAccount({ prefix: "identity-admin", admin: true }); accounts.push(admin);
    const client = await createDisposableAccount({ prefix: "identity-client" }); accounts.push(client);
    const db = regressionAdminClient();
    const name = `Revisión de identidad ${client.id}`;
    const { error } = await db.from("profiles").update({ full_name: name, cedula: null, client_identity_status: "pending" }).eq("id", client.id);
    if (error) throw error;
    await loginAs(page, admin.email, admin.password);
    await page.goto("/admin/identificaciones");
    await expect(page.getByRole("heading", { name: "Identificaciones", exact: true })).toBeVisible();
    await expect(page.getByText("Consultar identificación", { exact: true })).toBeVisible();
    await expect(page.getByText(/Admite identificación nacional, jurídica, DIMEX y NITE/)).toBeVisible();
    await page.getByRole("textbox", { name: "Número de identificación", exact: true }).fill("123");
    await page.locator("#admin-padron-form").getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(page.locator("#admin-padron-form").getByRole("alert")).toContainText("identificación válida");
    await page.getByRole("textbox", { name: "Buscar pendiente" }).fill(name);
    const row = page.getByTestId("identity-review-row").filter({ hasText: name });
    await expect(row).toHaveCount(1); await expect(row).toContainText("Sin identificación registrada");
    await row.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(row.getByText("Revisión manual", { exact: true })).toBeVisible();
    await expect(row).toContainText("Falta una identificación válida");
    await expect(row.getByRole("button", { name: "Verificar coincidencia", exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    const { data } = await db.from("profiles").select("client_identity_status,full_name").eq("id", client.id).single();
    expect(data).toEqual({ client_identity_status: "pending", full_name: name });
    const response = await page.request.post("/api/admin/identificaciones/verificar", { data: { accountId: client.id, cedula: "999999999", canVerify: true } });
    expect(response.status()).toBe(200); expect((await response.json()).outcome).toBe("changed");
    const { data: after } = await db.from("profiles").select("client_identity_status").eq("id", client.id).single();
    expect(after?.client_identity_status).toBe("pending");
  } finally { for (const account of accounts.reverse()) await cleanupDisposableAccount(account); }
});
