import { expect, test } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";

// Own an isolated project: the first public card may belong to somebody else,
// and editing shared fixtures affects unrelated suites later in the run.
test("@seeded el cliente corrige su proyecto y el cambio queda", async ({ page }) => {
  test.skip(isMobileProject(test.info()), "La tarjeta de acciones del dueño es de computadora.");
  test.skip(!canRunSeededRegression(), "Requires the isolated regression database.");
  let account: DisposableAccount | undefined;
  let projectId: string | undefined;
  const db = regressionAdminClient();
  try {
    account = await createDisposableAccount({ prefix: "edit-project" });
    const { data: project, error } = await db.from("projects").insert({
      client_id: account.id, category_id: "redes_internet",
      title: "Instalar dos cámaras en la entrada",
      description: "Necesito instalar dos cámaras en la entrada del garaje.",
      provincia_id: "al", canton_id: "al-al", status: "open",
      allow_direct_contact: true, allow_phone_contact: false,
    }).select("id").single();
    if (error) throw error;
    projectId = project.id;
    await page.setViewportSize({ width: 1366, height: 900 });
    await loginAs(page, account.email, account.password);
    await gotoOK(page, `/proyectos/${projectId}`);
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Administrar", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const caja = page.locator('[role=dialog] textarea');
    await expect(caja).not.toHaveValue("");
    await expect(page.locator('[role=dialog] input[type=tel]')).toHaveCount(0);
    const descripcion = `Dos cámaras en la entrada del garaje. corregido ${Date.now()}`;
    await caja.fill(descripcion);
    await page.getByRole("button", { name: /Guardar cambios/ }).click();
    const updated = page.getByText(descripcion, { exact: true }).filter({ visible: true }).first();
    await expect(updated).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(updated).toBeVisible();
    const { data: saved, error: savedError } = await db.from("projects").select("description").eq("id", projectId).single();
    if (savedError) throw savedError;
    expect(saved.description).toBe(descripcion);
  } finally {
    if (projectId) await db.from("projects").delete().eq("id", projectId);
    if (account) await cleanupDisposableAccount(account);
  }
});
