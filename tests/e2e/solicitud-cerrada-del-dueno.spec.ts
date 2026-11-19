import { expect, test } from "playwright/test";
import { gotoOK, loginAs } from "./helpers";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { tramoFicha } from "../../src/lib/marketplace-url";

/**
 * UNA SOLICITUD CERRADA POR INACTIVIDAD, ABIERTA POR SU DUEÑO (18-nov-2026).
 * «Ver solicitud» del panel usa el enlace corto (título + 8). Con él, la ficha
 * de una solicitud cancelada daba «página no encontrada» a quien la publicó.
 * Ahora la ve completa, con el aviso y «Volver a publicar».
 */
test("@seeded el dueño abre su solicitud cerrada con el enlace corto y la vuelve a publicar", async ({ page }) => {
  test.skip(!canRunSeededRegression(), "Requires the isolated regression database.");
  let account: DisposableAccount | undefined;
  let projectId: string | undefined;
  const db = regressionAdminClient();
  try {
    account = await createDisposableAccount({ prefix: "closed-project" });
    const titulo = "Pintar la fachada de la casa";
    const { data: project, error } = await db.from("projects").insert({
      client_id: account.id, category_id: "pintura",
      title: titulo,
      description: "Necesito pintar la fachada de una casa de un piso.",
      provincia_id: "al", canton_id: "al-al", status: "cancelled",
      allow_direct_contact: true, allow_phone_contact: false,
    }).select("id").single();
    if (error) throw error;
    projectId = project.id as string;

    await loginAs(page, account.email, account.password);
    await gotoOK(page, `/solicitudes/${tramoFicha(titulo, projectId)}`);
    await expect(page.getByText("Página no encontrada")).toHaveCount(0);
    await expect(page.getByText(titulo).filter({ visible: true }).first()).toBeVisible();
    const aviso = page.getByTestId("volver-a-publicar").filter({ visible: true });
    await expect(aviso).toContainText("Esta solicitud está cerrada");
    // Es suya: no se le ofrece escribirse por WhatsApp.
    await expect(page.getByRole("link", { name: /WhatsApp/ }).filter({ visible: true })).toHaveCount(0);

    await aviso.getByRole("button", { name: "Volver a publicar" }).click();
    await expect(page.getByTestId("volver-a-publicar")).toHaveCount(0, { timeout: 15000 });
    const { data: saved, error: savedError } = await db.from("projects").select("status").eq("id", projectId).single();
    if (savedError) throw savedError;
    expect(saved.status).toBe("open");
  } finally {
    if (projectId) await db.from("projects").delete().eq("id", projectId);
    if (account) await cleanupDisposableAccount(account);
  }
});
