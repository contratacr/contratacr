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
for (const kind of ["company", "person"] as const) test(`private verification documents ${kind} validate files and deduplicate retries`, async ({ page, request }) => {
  test.setTimeout(120_000);
  const apiHeaders = { "cf-connecting-ip": `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}` };
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
      cedula: kind === "company" ? "3101999999" : "199999999" });
    if (profileError) throw profileError;
    const { error: proError } = await db.from("professionals").insert({ ...pro, category_id: template.category_id, slug: `verification-${pro.id}`, business_name: "Cuenta de prueba",
      whatsapp: "+50670000009", bio: "Cuenta temporal de regresión.", verification_status: "pending", is_verified: false, verification_updated_at: reviewTime });
    if (proError) throw proError;
    await loginAs(page, email, password);
    await page.waitForLoadState("networkidle");
    const api = page.request;
    expect((await api.get("/api/verification/documents")).status()).toBe(200);
    await page.goto("/dashboard/profesional?tab=verificacion");
    const panel = page.getByTestId("verification-documents");
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
    const invalid = await api.post("/api/verification/documents", { headers: apiHeaders, multipart: { identity: { name: "false.png", mimeType: "image/png", buffer: Buffer.from("not an image") }, company: "missing" } });
    expect(invalid.status()).toBe(400);
    const image = { name: "regression-fixture.png", mimeType: "image/png", buffer: readFileSync("public/brand/logo-primary.png") };
    if (kind === "company") {
      const missing = await api.post("/api/verification/documents", { headers: apiHeaders, multipart: { identity: image } });
      expect(missing.status()).toBe(400);
    }
    await panel.locator('input[type="file"]').nth(0).setInputFiles(image);
    if (kind === "company") await panel.locator('input[type="file"]').nth(1).setInputFiles(image);
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
    const { data: messages, error: messageError } = await db.from("support_ticket_messages").select("attachments").eq("ticket_id", ticketId!);
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
    await expect(page.getByText("Documentos en revisión", {exact: true})).toBeVisible();
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
