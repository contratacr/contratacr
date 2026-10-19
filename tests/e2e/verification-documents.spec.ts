import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { hasVerificationDocuments } from "../../src/lib/verification/documents";
import { test, expect } from "playwright/test";
import { loginAs } from "./helpers";
import { E2E_USERS, regressionAdminClient } from "./seed";

function capturePath(filename: string) {
  return process.env.CCR_PREVIEW_OUTPUT_DIR ? resolve(process.env.CCR_PREVIEW_OUTPUT_DIR, filename) : test.info().outputPath(filename);
}

// Isolated disposable identities: parallel regression never changes another test's role.
for (const kind of ["company", "person", "dimex"] as const) test(`private verification documents ${kind} validate files and deduplicate retries`, async ({ page: initialPage, request }) => {
  let page = initialPage;
  test.setTimeout(120_000);
  const apiHeaders = { "x-forwarded-for": `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}` };
  const blockedHeaders = { "x-forwarded-for": `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const db = regressionAdminClient();
  expect((await request.get("/api/verification/documents")).status()).toBe(401);
  const { data: template, error: templateError } = await db.from("professionals").select("category_id").eq("slug", E2E_USERS.professional.slug).single();
  if (templateError) throw templateError;
  const email = `e2e-v-${crypto.randomUUID().slice(0, 8)}@contratacr.test`;
  const password = `Aa1!${crypto.randomUUID().slice(0, 12)}`;
  const { data: account, error: authError } = await db.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: "María Elena Prueba Ejemplo", role: "professional", is_provider: true, onboarding_completed: true } });
  if (authError || !account.user) throw authError ?? new Error("Could not create disposable fixture");
  const pro = { id: crypto.randomUUID(), profile_id: account.user.id };
  const reviewTime = new Date().toISOString();
  let ticketId: string | undefined;
  try {
    const { error: profileError } = await db.from("profiles").upsert({ id: pro.profile_id, email, full_name: "María Elena Prueba Ejemplo", role: "professional", is_provider: true, onboarding_completed: true,
      cedula: kind === "company" ? "3101999999" : kind === "dimex" ? "12345678901" : "199999999" });
    if (profileError) throw profileError;
    const { error: proError } = await db.from("professionals").insert({ ...pro, category_id: template.category_id, slug: `verification-${pro.id}`, business_name: "Cuenta de prueba",
      whatsapp: "+50670000009", bio: "Cuenta temporal de regresión.", verification_status: "pending", is_verified: false, verification_provider: "hacienda_api", verification_reason: "Identificación no encontrada.", verification_updated_at: reviewTime });
    if (proError) throw proError;
    await loginAs(page, email, password);
    await page.waitForLoadState("networkidle");
    const api = page.request;
    expect((await api.get("/api/verification/documents")).status()).toBe(200);
    const originalId = kind === "company" ? "3101999999" : kind === "dimex" ? "12345678901" : "199999999";
    await db.from("profiles").update({ cedula: null }).eq("id", pro.profile_id);
    expect((await api.post("/api/appeals", { headers: blockedHeaders, data: {} })).status()).toBe(409);
    expect((await api.post("/api/verification/documents", { headers: blockedHeaders })).status()).toBe(409);
    await page.goto("/dashboard/profesional?tab=verificacion");
    await expect(page.getByRole("button", { name: "Agregar identificación", exact: true })).toBeVisible();
    await expect(page.getByTestId("verification-documents")).toHaveCount(0);
    await db.from("profiles").update({ cedula: originalId }).eq("id", pro.profile_id);
    await db.from("professionals").update({ verification_status: "verified", is_verified: true }).eq("id", pro.id);
    expect((await api.post("/api/verification/documents", { headers: blockedHeaders })).status()).toBe(409);
    await page.goto("/dashboard/profesional?tab=verificacion");
    await expect(page.locator("[data-current-identification]")).toBeVisible();
    await expect(page.getByTestId("verification-documents")).toHaveCount(0);
    const verifiedName = page.locator("[data-current-identification] [data-nombre-identificacion]");
    const badge = verifiedName.locator("[data-verification-badge]");
    await expect(badge).toBeVisible();
    await expect(page.locator("[data-current-identification] [data-verification-badge]")).toHaveCount(1);
    const alignment = await verifiedName.evaluate(element => {
      const text = element.querySelector("span.whitespace-normal")!.getBoundingClientRect();
      const mark = element.querySelector("[data-verification-badge] svg")!.getBoundingClientRect();
      return { gap: mark.left - text.right, center: Math.abs(mark.top + mark.height / 2 - text.top - text.height / 2) };
    });
    expect(alignment.gap).toBeGreaterThanOrEqual(0);
    expect(alignment.gap).toBeLessThanOrEqual(5);
    expect(alignment.center).toBeLessThanOrEqual(2);
    await expect(page.locator("[data-current-identification] [data-nombre-identificacion] .whitespace-normal")).toHaveCSS("white-space", "normal");
    await page.screenshot({ path: capturePath(`${kind}-verified-name-${test.info().project.name}.png`), fullPage: true });
    await expect(page.getByRole("main")).not.toContainText(/Hacienda/);
    await db.from("professionals").update({ verification_status: "pending", is_verified: false, verification_reason: null }).eq("id", pro.id);
    expect((await api.post("/api/appeals", { headers: blockedHeaders, data: {} })).status()).toBe(409);
    expect((await api.post("/api/verification/documents", { headers: blockedHeaders })).status()).toBe(409);
    const holdId = crypto.randomUUID();
    await db.from("provider_verification_log").insert({ id: holdId, professional_id: pro.id, action: "reverted_pending", from_status: "verified", to_status: "pending", reason: "Disposable regression hold" }).throwOnError();
    const heldState = await (await api.get("/api/verification/documents")).json();
    expect(heldState.requiresSupport).toBe(true);
    expect(heldState.canVerify).toBe(false);
    expect(heldState.canReview).toBe(false);
    let automaticAttempts = 0;
    const countVerification = (request: import("playwright/test").Request) => { if (request.url().includes("/api/verify-identity")) automaticAttempts++; };
    page.on("request", countVerification);
    await page.goto("/dashboard/profesional?tab=verificacion");
    const heldPanel = page.getByTestId("verification-documents");
    await expect(heldPanel).toContainText("Pendiente de revisión");
    await expect(heldPanel.getByRole("link", { name: "Contactar a soporte" })).toHaveCount(0);
    await expect(heldPanel.getByRole("button", { name: "Reintentar verificación" })).toHaveCount(0);
    await expect(heldPanel.getByRole("button", { name: "Solicitar revisión manual" })).toHaveCount(0);
    expect(automaticAttempts).toBe(0);
    page.off("request", countVerification);
    await page.screenshot({ path: capturePath(`${kind}-admin-hold-${test.info().project.name}.png`), fullPage: true });
    // Finding a number is only a preview, never an approval of this account.
    const lookupUrl = `**/api/cedula/${originalId}`;
    await page.route(lookupUrl, route => route.fulfill({ json: { found: true, fullName: "María Elena Prueba Ejemplo", dob: null } }));
    await page.getByRole("button", { name: "Cambiar identificación", exact: true }).click();
    await page.locator("#identificacion").fill(originalId);
    const lookupNote = page.getByText("Identificación encontrada. Guardala para completar el proceso.", { exact: true });
    await expect(lookupNote).toBeVisible();
    await expect(lookupNote.locator("..").locator("[data-verification-badge]")).toHaveCount(0);
    const [saveIdentity] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/api/add-cedula") && response.request().method() === "POST"),
      page.getByRole("button", { name: "Agregar", exact: true }).click(),
    ]);
    expect(saveIdentity.status()).toBe(200);
    expect((await saveIdentity.json()).outcome).toBe("ticket");
    // Reopen in a fresh tab to prove persisted server state, independently of
    // the original editor's asynchronous save/return navigation.
    const reopenedPage = await page.context().newPage();
    await page.close();
    page = reopenedPage;
    await page.goto("/dashboard/profesional?tab=verificacion");
    await expect(page.getByTestId("verification-documents")).toContainText("Pendiente de revisión");
    await expect(page.locator("[data-current-identification] [data-verification-badge]")).toHaveCount(0);
    await page.unroute(lookupUrl);
    await page.waitForLoadState("networkidle");
    await page.goto("/promociones/publicar");
    await expect(page.locator("[data-aviso-sin-verificar]")).toBeVisible();
    await db.from("professionals").update({ verification_status: "verified", is_verified: true }).eq("id", pro.id).throwOnError();
    const [verifiedResponse] = await Promise.all([
      page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname.endsWith("/professionals") && url.searchParams.get("select") === "verification_status"; }),
      page.goto("/promociones/publicar"),
    ]);
    const verifiedPayload = await verifiedResponse.json();
    expect((Array.isArray(verifiedPayload) ? verifiedPayload[0] : verifiedPayload).verification_status).toBe("verified");
    await expect(page.locator("[data-aviso-sin-verificar]")).toHaveCount(0);
    await page.screenshot({ path: capturePath(`${kind}-verified-promotion-${test.info().project.name}.png`), fullPage: true });
    await db.from("professionals").update({ verification_status: "pending", is_verified: false }).eq("id", pro.id).throwOnError();
    await db.from("provider_verification_log").delete().eq("id", holdId).throwOnError();
    await db.from("professionals").update({ verification_reason: "Identificación no encontrada." }).eq("id", pro.id);
    await page.goto("/dashboard/profesional?tab=verificacion");
    const panel = page.getByTestId("verification-documents");
    await expect(panel.getByRole("button", { name: "Subir foto", exact: true })).toBeVisible();
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Enviar a revisión", exact: true })).toBeDisabled();
    await expect(panel).not.toContainText(/Hacienda|API|padrón/);
    await expect(panel.getByText(kind === "company" ? "Personería o autorización" : "Foto con tu identificación", {exact: true})).toBeVisible();
    await panel.getByRole("button", {name: "Enviar a revisión"}).waitFor();
    await expect(panel.getByText("1", {exact: true})).toHaveCount(0);
    await expect(panel.getByText("2", {exact: true})).toHaveCount(0);
    const change = await page.getByRole("button", {name: "Cambiar identificación", exact: true}).boundingBox();
    for (const name of kind === "company" ? ["Subir foto", "Subir documento", "Enviar a revisión"] : ["Subir foto", "Enviar a revisión"]) {
      const button = await panel.getByRole("button", {name, exact: true}).boundingBox();
      expect(button!.width).toBeCloseTo(change!.width, 0);
      expect(button!.height).toBeCloseTo(change!.height, 0);
    }
    await page.screenshot({path: capturePath(`${kind}-live-${test.info().project.name}.png`), fullPage: true});
    await panel.locator("..").screenshot({path: capturePath(`${kind}-detail-${test.info().project.name}.png`)});
    // Legacy comment-only appeals remain supported by the API, outside this photo-only UI.
    const appealResponse = await api.post("/api/appeals", { headers: apiHeaders, data: { message: "Solicito revisión manual." } });
    expect(appealResponse.status()).toBe(200);
    ticketId = (await appealResponse.json()).ticketId;
    expect((await (await api.post("/api/appeals", { headers: apiHeaders, data: { message: "Retry" } })).json()).ticketId).toBe(ticketId);
    expect((await (await api.get("/api/verification/documents")).json()).reviewRequested).toBe(true);
    const { data: appealed } = await db.from("professionals").select("verification_status").eq("id", pro.id).single();
    expect(appealed?.verification_status).toBe("under_appeal");
    expect((await (await api.post("/api/verify-identity", { headers: apiHeaders })).json()).outcome).toBe("ticket");
    const invalid = await api.post("/api/verification/documents", { headers: apiHeaders, multipart: { identity: { name: "false.png", mimeType: "image/png", buffer: Buffer.from("not an image") }, company: "missing" } });
    expect(invalid.status()).toBe(400);
    const image = { name: "regression-fixture.png", mimeType: "image/png", buffer: readFileSync("public/brand/logo-primary.png") };
    if (kind === "company") {
      const missing = await api.post("/api/verification/documents", { headers: apiHeaders, multipart: { identity: image } });
      expect(missing.status()).toBe(400);
    }
    await page.goto("/dashboard/profesional?tab=verificacion");
    await panel.getByRole("button", { name: "Adjuntar documentos", exact: true }).click();
    await panel.locator('input[type="file"]').nth(0).setInputFiles(image);
    if (kind === "company") await panel.locator('input[type="file"]').nth(1).setInputFiles(image);
    await expect(panel.getByRole("button", {name: "Enviar a revisión"})).toBeEnabled();
    const [first] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/api/verification/documents") && response.request().method() === "POST"),
      panel.getByRole("button", {name: "Enviar a revisión"}).click(),
    ]);
    expect(first.status(), await first.text()).toBe(200);
    ticketId = (await first.json()).ticketId;
    expect(ticketId).toBeTruthy();
    const retry = await api.post("/api/verification/documents", { headers: apiHeaders, multipart: kind === "company" ? { identity: image, company: image } : { identity: image } });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).ticketId).toBe(ticketId);
    await db.from("professionals").update({ verification_updated_at: new Date().toISOString() }).eq("id", pro.id);
    expect((await (await api.get("/api/verification/documents")).json()).submitted).toBe(true);
    const { data: messages, error: messageError } = await db.from("support_ticket_messages").select("attachments").eq("ticket_id", ticketId!).eq("id", ticketId!);
    expect(messageError).toBeNull(); expect(messages).toHaveLength(1);
    expect(messages![0].attachments).toHaveLength(kind === "company" ? 2 : 1);
    expect(messages![0].attachments[0].name).toContain("Identificación");
    if (kind === "company") expect(messages![0].attachments[1].name).toContain("Personería");
    const { data: objects } = await db.storage.from("support-attachments").list(`${ticketId}/${pro.profile_id}`);
    expect(objects).toHaveLength(kind === "company" ? 2 : 1);
    expect(await hasVerificationDocuments(pro.profile_id)).toBe(true);
    await db.from("support_tickets").update({status: "in_progress"}).eq("id", ticketId!);
    expect(await hasVerificationDocuments(pro.profile_id)).toBe(true);
    // No anonymous public URL can expose the identity files.
    const attachment = messages![0].attachments[0];
    const publicUrl = db.storage.from("support-attachments").getPublicUrl(attachment.path).data.publicUrl;
    expect((await request.get(publicUrl)).ok()).toBe(false);
    await page.goto("/dashboard/profesional?tab=verificacion");
    await expect(page.getByText("Tu solicitud está en revisión.", {exact: true})).toBeVisible();
    await page.screenshot({path: capturePath(`${kind}-submitted-live-${test.info().project.name}.png`), fullPage: true});
    const {error: roleError} = await db.from("profiles").update({role: "admin"}).eq("id", pro.profile_id);
    if (roleError) throw roleError;
    const caseResponse = await api.get(`/api/admin/providers/${pro.id}`);
    expect(caseResponse.status()).toBe(200);
    const adminCase = await caseResponse.json();
    expect(adminCase.documents[0].attachments).toHaveLength(kind === "company" ? 2 : 1);
    expect(adminCase.documents[0].attachments[0].url).toBeTruthy();
    await page.goto(`/admin/proveedores/${pro.id}`);
    await expect(page.getByText("Documentos recibidos", {exact: true})).toBeVisible();
    await page.getByText("Documentos recibidos", {exact: true}).scrollIntoViewIfNeeded();
    await page.screenshot({path: capturePath(`${kind}-admin-live-${test.info().project.name}.png`), fullPage: true});
    await page.getByText("Documentos recibidos", {exact: true}).locator("..").screenshot({path: capturePath(`${kind}-admin-detail-${test.info().project.name}.png`)});
    // Only a private case is created; submission never creates outgoing mail.
    const { count: deliveries } = await db.from("email_deliveries").select("id", { count: "exact", head: true }).eq("professional_id", pro.id).gte("created_at", reviewTime);
    expect(deliveries).toBe(0);
  } finally {
    if (!ticketId) {
      const { data: tickets } = await db.from("support_tickets").select("id").eq("user_id", pro.profile_id).eq("topic", "verification_documents").gte("created_at", reviewTime);
      ticketId = tickets?.[0]?.id;
    }
    if (ticketId) {
      const prefix = `${ticketId}/${pro.profile_id}`;
      const { data: files } = await db.storage.from("support-attachments").list(prefix);
      if (files?.length) await db.storage.from("support-attachments").remove(files.map(file => `${prefix}/${file.name}`));
      await db.from("support_ticket_messages").delete().eq("ticket_id", ticketId);
      await db.from("support_tickets").delete().eq("id", ticketId);
    }
    await db.from("professionals").delete().eq("id", pro.id);
    const { error: cleanupError } = await db.auth.admin.deleteUser(pro.profile_id);
    if (cleanupError) throw cleanupError;
  }
});
