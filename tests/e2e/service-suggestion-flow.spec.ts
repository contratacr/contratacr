import { test, expect } from "playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loginAs, gotoOK, expectNoHorizontalOverflow } from "./helpers";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { notificationActionHref } from "../../src/lib/notification-link";

test.describe("service requests require an explicit profile save", () => {
  test.skip(!canRunSeededRegression(), "Requires the isolated regression database.");
  test("multiple requesters, authenticated ownership, approval, editor draft, defer, save and duplicate resolution", async ({ page, browser }) => {
    test.slow();
    const db = regressionAdminClient();
    // Each browser project represents an independent client IP in the local proxy.
    // Keep the real limiter active; this scenario remains below its ten-request cap.
    const headers = { "cf-connecting-ip": `192.0.2.${["chromium-desktop", "chromium-mobile", "webkit-mobile"].indexOf(test.info().project.name) + 10}` };
    const accounts: DisposableAccount[] = [];
    const suggestionIds: string[] = [];
    const contexts = [];
    try {
      const a = await createDisposableAccount({ prefix: "request-a", professional: true }); accounts.push(a);
      const b = await createDisposableAccount({ prefix: "request-b", professional: true }); accounts.push(b);
      const admin = await createDisposableAccount({ prefix: "request-admin", admin: true }); accounts.push(admin);
      const other = await browser.newContext(); contexts.push(other);
      const otherPage = await other.newPage();
      const moderator = await browser.newContext(); contexts.push(moderator);
      const adminPage = await moderator.newPage();
      const guest = await browser.newContext(); contexts.push(guest);
      const name = `Taller solicitud ${randomUUID().slice(0,8)}`;
      // Public suggestions cannot impersonate a profile through a supplied UUID.
      const spoof = await guest.request.post("/api/categories/suggest", { headers, data: { name: `Anónimo ${name}`, userId: a.id } });
      expect(spoof.ok()).toBe(true);
      const anonymousId = (await spoof.json()).suggestionId;
      const { data: anonymous } = await db.from("category_suggestions").select("id,suggested_by").eq("id", anonymousId).single();
      expect(anonymous?.suggested_by).toBeNull(); suggestionIds.push(anonymous!.id);
      expect((await guest.request.get("/api/categories/requests")).status()).toBe(401);
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      expect((await anon.from("service_suggestion_requests").select("*")).error).toBeTruthy();
      await page.context().setExtraHTTPHeaders(headers);
      await loginAs(page, a.email, a.password);
      await gotoOK(page, "/dashboard/profesional?tab=services&mode=offer");
      await page.getByRole("button", { name: "Agregar servicio", exact: true }).click();
      const picker = page.getByTestId("services-add-picker");
      await picker.getByRole("button", { name: "Solicitar servicio", exact: true }).click();
      await expect(picker).toContainText("Si lo aprobamos, te avisaremos");
      await picker.getByPlaceholder("Nombre del servicio", { exact: true }).fill(name);
      const [uiRequest] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith("/api/categories/suggest") && r.request().method() === "POST"),
        picker.getByRole("button", { name: "Solicitar servicio", exact: true }).click(),
      ]);
      expect(uiRequest.ok()).toBe(true);
      await expect(picker).toContainText("Enviamos tu sugerencia al equipo para revisión");
      const before = (await db.from("professionals").select("professions,services").eq("id", a.professionalId!).single()).data;
      expect((await page.request.patch("/api/admin/categories", { data: { id: "no", status: "approved" } })).status()).toBe(403);
      const submitted = await page.request.post("/api/categories/suggest", { headers, data: { name, userId: b.id } });
      expect(submitted.ok()).toBe(true);
      const submittedId = (await submitted.json()).suggestionId;
      const { data: suggestion } = await db.from("category_suggestions").select("id,suggested_by").eq("id", submittedId).single();
      expect(suggestion?.suggested_by).toBe(a.id); suggestionIds.push(suggestion!.id);
      await loginAs(otherPage, b.email, b.password);
      expect((await other.request.post("/api/categories/suggest", { headers, data: { name } })).ok()).toBe(true);
      expect((await other.request.post("/api/categories/suggest", { headers, data: { name } })).ok()).toBe(true);
      expect((await db.from("service_suggestion_requests").select("profile_id").eq("suggestion_id", suggestion!.id)).data?.map(r => r.profile_id).sort()).toEqual([a.id,b.id].sort());
      const renamed = `Servicio aprobado ${name.toLowerCase()}`;
      await loginAs(adminPage, admin.email, admin.password);
      const approve = () => moderator.request.patch("/api/admin/categories", { data: { id: suggestion!.id, status: "approved", label: renamed, labelEn: "Approved test service", groupId: "educacion", esSalud: false, supportsVideoconsulta: false } });
      expect((await approve()).ok()).toBe(true);
      expect((await approve()).ok()).toBe(true);
      const { data: notices } = await db.from("notifications").select("user_id,type,data").in("user_id", [a.id,b.id]).eq("type", "suggestion_approved");
      const matching = notices?.filter(n => n.data?.suggestion_id === suggestion!.id) ?? [];
      expect(matching).toHaveLength(2);
      expect(matching.map(n => n.user_id).sort()).toEqual([a.id,b.id].sort());
      expect((await db.from("professionals").select("professions,services").eq("id", a.professionalId!).single()).data).toEqual(before);
      const invitations = await (await page.request.get("/api/categories/requests")).json();
      expect(invitations.invitations).toEqual(expect.arrayContaining([expect.objectContaining({ categoryId: suggestion!.id, name: renamed })]));
      // No cross-account dismissal, even if a client submits somebody else's ID.
      await page.request.patch("/api/categories/requests", { data: { suggestionId: suggestion!.id, profile_id: b.id } });
      expect((await db.from("service_suggestion_requests").select("dismissed").eq("suggestion_id", suggestion!.id).eq("profile_id", b.id).single()).data?.dismissed).toBe(false);
      await gotoOK(page, "/dashboard/profesional?tab=home&mode=offer");
      await expect(page.getByTestId("service-request-invitations")).toHaveCount(0);
      await gotoOK(page, "/dashboard/profesional?tab=services&mode=offer");
      const card = page.getByTestId("service-request-invitations");
      await expect(card).toContainText(renamed);
      await page.screenshot({ path: test.info().outputPath("approved-service-invitation.png"), fullPage: true });
      await card.getByRole("link", { name: "Completar servicio" }).click();
      let dialog = page.getByRole("dialog").filter({ has: page.getByTestId("service-edit-save") });
      await expect(dialog).toBeVisible(); await expect(dialog).toContainText(renamed);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: test.info().outputPath("approved-service-editor.png"), fullPage: true });
      expect((await db.from("professionals").select("professions,services").eq("id", a.professionalId!).single()).data).toEqual(before);
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).filter({ visible: true }).first().click();
      await expect(dialog).toHaveCount(0);
      expect((await db.from("professionals").select("professions,services").eq("id", a.professionalId!).single()).data).toEqual(before);
      await card.getByRole("link", { name: "Completar servicio" }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).filter({ visible: true }).first().click();
      await expect(dialog).toHaveCount(0);
      const href = notificationActionHref(matching[0], undefined, "en")!;
      expect(href).toContain("serviceRequest=");
      await gotoOK(page, href);
      dialog = page.getByRole("dialog").filter({ has: page.getByTestId("service-edit-save") });
      await expect(dialog).toBeVisible(); await expect(dialog).toContainText("Approved test service");
      await dialog.locator("textarea").fill("Service requested and explicitly saved in isolated regression.");
      await dialog.getByTestId("servicio-consultar-precio").click();
      await dialog.getByRole("button", { name: "Month", exact: true }).click();
      await page.getByRole("option", { name: "January", exact: true }).click();
      await dialog.getByRole("button", { name: String(new Date().getFullYear()), exact: true }).click();
      await page.getByRole("option", { name: "2020", exact: true }).click();
      await page.getByTestId("service-edit-save").click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await db.from("professionals").select("professions").eq("id", a.professionalId!).single()).data?.professions).toContain(suggestion!.id);
      await expect(page.getByTestId("service-request-invitations")).toHaveCount(0);
      await gotoOK(page, href);
      await expect(page.getByTestId("service-edit-save")).toHaveCount(0);
      const saved = (await db.from("professionals").select("professions,services").eq("id", a.professionalId!).single()).data!;
      expect(saved.professions.filter((id: string) => id === suggestion!.id)).toHaveLength(1);
      expect(saved.services.filter((s: { category?: string }) => s.category === suggestion!.id)).toHaveLength(1);
      // Duplicate resolution points at the final active service, not a new category.
      const duplicateName = `Duplicado ${name}`;
      expect((await other.request.post("/api/categories/suggest", { headers, data: { name: duplicateName } })).ok()).toBe(true);
      const { data: duplicate } = await db.from("category_suggestions").select("id").eq("label", duplicateName.charAt(0) + duplicateName.slice(1).toLowerCase()).single(); suggestionIds.push(duplicate!.id);
      expect((await moderator.request.patch("/api/admin/categories", { data: { id: duplicate!.id, status: "rejected", existingCategoryId: anonymous!.id } })).status()).toBe(400);
      await gotoOK(adminPage, "/admin/servicios");
      await adminPage.getByRole("button", { name: /^Sugerencias/ }).click();
      const row = adminPage.locator("div.grid").filter({ has: adminPage.locator(`select[id="existing-${duplicate!.id}"]`) }).last();
      await adminPage.locator(`select[id="existing-${duplicate!.id}"]`).selectOption(suggestion!.id);
      await row.getByRole("button", { name: "Ya existe → ofrecer este servicio" }).click();
      await adminPage.getByRole("button", { name: "Confirmar servicio", exact: true }).click();
      await expect.poll(async () => (await db.from("category_suggestions").select("resolved_category_id").eq("id", duplicate!.id).single()).data?.resolved_category_id).toBe(suggestion!.id);
      const resubmittedDuplicate = await other.request.post("/api/categories/suggest", { headers, data: { name: duplicateName } });
      expect(resubmittedDuplicate.ok()).toBe(true);
      expect(await resubmittedDuplicate.json()).toMatchObject({ alreadyApproved: true, categoryId: suggestion!.id });
      expect((await db.from("category_suggestions").select("status").eq("id", duplicate!.id).single()).data?.status).toBe("rejected");
      const bInvitations = await (await other.request.get("/api/categories/requests")).json();
      expect(bInvitations.invitations.some((i: { suggestionId: string; categoryId: string }) => i.suggestionId === duplicate!.id && i.categoryId === suggestion!.id)).toBe(true);
      await expectNoHorizontalOverflow(adminPage);
    } finally {
      for (const context of contexts) await context.close();
      for (const account of accounts.reverse()) await cleanupDisposableAccount(account);
      if (suggestionIds.length) {
        await db.from("notifications").delete().in("data->>suggestion_id", suggestionIds);
        await db.from("category_suggestions").delete().in("id", suggestionIds).throwOnError();
        await db.from("categories").delete().in("id", suggestionIds).throwOnError();
      }
    }
  });
});
