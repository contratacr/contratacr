import { test, expect, type Page } from "playwright/test";
import { randomUUID } from "node:crypto";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { completeAdminMfa } from "./admin-mfa-helper";
import { gotoOK, resetAuth, waitForInteractivePage } from "./helpers";

test.beforeEach(() => {
  if (!canRunSeededRegression()) throw new Error("Administrative integration requires the isolated test database; refusing production mutations.");
});

async function loginAdmin(page: Page, account: DisposableAccount) {
  await resetAuth(page);
  await gotoOK(page, "/admin");
  await waitForInteractivePage(page);
  await page.getByPlaceholder(/Correo de administrador/i).fill(account.email);
  await page.getByPlaceholder(/Contrase.a|Contrasena/i).fill(account.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByPlaceholder(/Correo de administrador/i)).toBeHidden({ timeout: 20_000 });
  await completeAdminMfa(page, account.email);
}

test("live administrative metadata and health require MFA and never grant chat content with the admin role alone", async ({ page }) => {
  test.setTimeout(180_000);
  const db = regressionAdminClient();
  let account: DisposableAccount | undefined;
  let client: DisposableAccount | undefined, professional: DisposableAccount | undefined;
  let conversationId = "", caseId = "";
  const privateBody = `Synthetic private case message ${randomUUID()}`;
  try {
    client = await createDisposableAccount({ prefix: "moderation-chat-client" });
    professional = await createDisposableAccount({ prefix: "moderation-chat-professional", professional: true });
    const conversation = await db.from("direct_conversations").insert({client_id:client.id,professional_id:professional.professionalId,professional_profile_id:professional.id,status:"open"}).select("id").single();
    if(conversation.error||!conversation.data)throw conversation.error??new Error("Could not create isolated conversation");
    conversationId=conversation.data.id;
    const message=await db.from("direct_messages").insert({conversation_id:conversationId,sender_id:client.id,body:privateBody});
    if(message.error)throw message.error;
    const report=await db.from("reports").insert({professional_id:professional.professionalId,target_type:"professional",target_id:professional.professionalId,subject_user_id:professional.id,reporter_id:client.id,conversation_id:conversationId,reason:"Synthetic participant report for restricted review",status:"open"}).select("id").single();
    if(report.error||!report.data)throw report.error??new Error("Could not create isolated chat case");
    caseId=report.data.id;
    account = await createDisposableAccount({ prefix: "moderation-metadata", admin: true });
    await loginAdmin(page, account);
    await gotoOK(page, "/admin/conversaciones");
    await expect(page.getByRole("heading", { name: "Conversaciones por responder", exact: true })).toBeVisible();
    const response = await page.request.get("/api/admin/conversaciones");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const metadata = await response.json();
    expect(metadata.canReview).toBe(false);
    expect(Array.isArray(metadata.rows)).toBe(true);
    for (const row of metadata.rows) expect(Object.keys(row).sort()).toEqual(["client_name", "id", "last_message_at", "professional_name", "since", "waiting_for"]);
    expect(metadata).not.toHaveProperty("messages");
    expect(JSON.stringify(metadata)).not.toContain(privateBody);
    await expect(page.getByText(privateBody,{exact:true})).toHaveCount(0);
    const denied = await page.request.post("/api/admin/conversaciones", {
      headers: { origin: new URL(page.url()).origin },
      data: { conversation: conversationId, ticket:null, report:caseId, reason: "Synthetic participant support investigation", offset: 0 },
    });
    expect(denied.status()).toBe(403);
    const rejected = await denied.json();
    expect(rejected).not.toHaveProperty("messages");
    expect(rejected).not.toHaveProperty("auditId");
    const permissions={user:account.id,moderation:true,support:true,identity:true};
    const grant=await page.request.post("/api/admin/permisos",{headers:{origin:new URL(page.url()).origin},data:{...permissions,chat:true,reason:"Synthetic explicit permission for participant case review"}});
    expect(grant.status()).toBe(200);
    await gotoOK(page,`/admin/conversaciones?conversation=${conversationId}&report=${caseId}`);
    await expect(page.getByLabel("ID del caso",{exact:true})).toHaveValue(caseId);
    await page.getByLabel("Motivo de consulta",{exact:true}).fill("Synthetic investigation authorized for this participant report");
    const auditedResponse=page.waitForResponse(r=>r.url().endsWith("/api/admin/conversaciones")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Registrar consulta y abrir mensajes",exact:true}).click();
    const reviewed=await auditedResponse;
    expect(reviewed.status()).toBe(200);
    const opened=await reviewed.json();
    expect(opened.auditId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(page.getByText(privateBody,{exact:true})).toBeVisible();
    await expect(page.getByText(`Consulta registrada: ${opened.auditId}`,{exact:true})).toBeVisible();
    const audit=await db.from("admin_chat_access_log").select("actor_id,conversation_id,report_id,message_count").eq("id",opened.auditId).single();
    expect(audit.error).toBeNull();
    expect(opened.messages.filter((message:{body:string|null})=>message.body===privateBody)).toHaveLength(1);
    expect(audit.data).toMatchObject({actor_id:account.id,conversation_id:conversationId,report_id:caseId,message_count:opened.messages.length});
    const unchangedMessage=await db.from("direct_messages").select("read_at").eq("conversation_id",conversationId).eq("body",privateBody).single();
    expect(unchangedMessage.error).toBeNull();
    expect(unchangedMessage.data?.read_at).toBeNull();
    await page.getByRole("button",{name:"Cerrar y ocultar contenido",exact:true}).click();
    await expect(page.getByText(privateBody,{exact:true})).toHaveCount(0);
    const closed=await db.from("reports").update({status:"resolved"}).eq("id",caseId);
    expect(closed.error).toBeNull();
    const closedReview=await page.request.post("/api/admin/conversaciones",{headers:{origin:new URL(page.url()).origin},data:{conversation:conversationId,ticket:null,report:caseId,reason:"Synthetic attempt to read a closed participant report",offset:0}});
    expect(closedReview.status()).toBe(403);
    const reopened=await db.from("reports").update({status:"open"}).eq("id",caseId);
    expect(reopened.error).toBeNull();
    const revoke=await page.request.post("/api/admin/permisos",{headers:{origin:new URL(page.url()).origin},data:{...permissions,chat:false,reason:"Synthetic reviewer permission revoked after case review"}});
    expect(revoke.status()).toBe(200);
    const revoked=await page.request.post("/api/admin/conversaciones",{headers:{origin:new URL(page.url()).origin},data:{conversation:conversationId,ticket:null,report:caseId,reason:"Synthetic attempt after explicit permission revocation",offset:0}});
    expect(revoked.status()).toBe(403);

    await gotoOK(page, "/admin/salud");
    await expect(page.getByRole("heading", { name: "Salud operativa", exact: true })).toBeVisible();
    const healthResponse = await page.request.get("/api/admin/salud");
    expect(healthResponse.status()).toBe(200);
    const health = await healthResponse.json();
    expect(Object.keys(health).sort()).toEqual(["checkedAt", "note", "rows", "scannerConfigured"]);
    expect(health.rows.length).toBeGreaterThan(0);
    for (const row of health.rows) {
      expect(Object.keys(row).sort()).toEqual(["count", "error", "key", "label"]);
      expect(row.error, row.key).toBe(false);
      expect(Number.isInteger(row.count), row.key).toBe(true);
    }
    const staffResponse = await page.request.get("/api/admin/permisos");
    expect(staffResponse.status()).toBe(200);
    const staff = (await staffResponse.json()).rows.find((row: { id: string }) => row.id === account!.id);
    expect(staff).toMatchObject({ moderation: true, support: true, identity: true, chat: false });
  } finally {
    if(caseId)await db.from("reports").delete().eq("id",caseId);
    if(conversationId)await db.from("direct_conversations").delete().eq("id",conversationId);
    await cleanupDisposableAccount(account);
    await cleanupDisposableAccount(client);
    await cleanupDisposableAccount(professional);
  }
});

test("live moderation withdraws and restores an offer and resolves its case with a durable audit", async ({ page }) => {
  test.setTimeout(240_000);
  const db = regressionAdminClient();
  let administrator: DisposableAccount | undefined;
  let owner: DisposableAccount | undefined;
  let reporter: DisposableAccount | undefined;
  let offerId = "", reportId = "";
  const title = `Synthetic moderation ${randomUUID()}`;
  try {
    owner = await createDisposableAccount({ prefix: "moderation-owner", professional: true });
    reporter = await createDisposableAccount({ prefix: "moderation-reporter" });
    administrator = await createDisposableAccount({ prefix: "moderation-operator", admin: true });
    const offer = await db.from("professional_offers").insert({
      professional_id: owner.professionalId, title, description: "Synthetic moderation fixture, not a real offer.",
      offer_type: "service_offer", service_label: "Redes e internet", price_now: 5000,
      currency: "CRC", price_unit: "total", location_label: "Atenas, Alajuela", status: "published",
    }).select("id").single();
    if (offer.error || !offer.data) throw offer.error ?? new Error("Could not create isolated offer");
    offerId = offer.data.id;
    const report = await db.from("reports").insert({
      professional_id: owner.professionalId, professional_name: title, target_type: "offer", target_id: offerId,
      subject_user_id: owner.id, reporter_id: reporter.id, reason: title, status: "open", priority: "urgent",
    }).select("id").single();
    if (report.error || !report.data) throw report.error ?? new Error("Could not create isolated report");
    reportId = report.data.id;
    await loginAdmin(page, administrator);
    await gotoOK(page, "/admin/reportes");
    await page.getByLabel(/^Prioridad\b/).selectOption("urgent");
    await page.locator("article").filter({ hasText: title }).getByRole("button", { name: "Atender y ver historial", exact: true }).click();
    await expect(page.getByLabel("ID del contenido o cuenta", { exact: true })).toHaveValue(offerId);
    const reason = page.getByLabel("Motivo (visible al afectado si se registra como decisión)", { exact: true });
    const action = page.getByLabel("Acción de moderación", { exact: true });
    await reason.fill("Synthetic policy violation confirmed by the reviewer");
    await action.selectOption("hide");
    await page.getByRole("button", { name: "Guardar acción y auditoría", exact: true }).click();
    await expect.poll(async () => (await db.from("moderation_holds").select("active").eq("target_type", "offer").eq("target_id", offerId).single()).data?.active).toBe(true);
    expect((await db.from("professional_offers").select("status").eq("id", offerId).single()).data?.status).toBe("paused");
    await expect(page.getByRole("button", { name: "Guardar acción y auditoría", exact: true })).toBeEnabled();
    await reason.fill("Synthetic case reviewed; restore its previous publication state");
    await action.selectOption("restore");
    await page.getByRole("button", { name: "Guardar acción y auditoría", exact: true }).click();
    await expect.poll(async () => (await db.from("moderation_holds").select("active").eq("target_type", "offer").eq("target_id", offerId).single()).data?.active).toBe(false);
    expect((await db.from("professional_offers").select("status").eq("id", offerId).single()).data?.status).toBe("published");
    await expect(page.getByRole("button", { name: "Resolver con motivo", exact: true })).toBeEnabled();
    await reason.fill("Synthetic report resolved after withdrawal and review");
    await page.getByRole("button", { name: "Resolver con motivo", exact: true }).click();
    await expect.poll(async () => (await db.from("reports").select("status").eq("id", reportId).single()).data?.status).toBe("resolved");
    const audit = await db.from("moderation_actions").select("actor_id,action,reason").eq("report_id", reportId);
    expect(audit.error).toBeNull();
    expect(audit.data?.map(row => row.action).sort()).toEqual(["case_update", "hide", "restore"]);
    expect(audit.data?.every(row => row.actor_id === administrator!.id && row.reason.length >= 5)).toBe(true);
  } finally {
    if (reportId) await db.from("reports").delete().eq("id", reportId);
    if (offerId) await db.from("professional_offers").delete().eq("id", offerId);
    await cleanupDisposableAccount(administrator);
    await cleanupDisposableAccount(reporter);
    await cleanupDisposableAccount(owner);
  }
});
