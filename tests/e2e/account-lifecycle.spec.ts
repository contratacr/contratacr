import { expect, test } from "playwright/test";
import { apiJson, expectHealthyPage, gotoOK, loginAs, resetAuth } from "./helpers";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

test.describe.configure({ mode: "serial" });

async function insertId(table: string, values: Record<string, unknown>) {
  const admin = regressionAdminClient();
  const { data, error } = await admin.from(table).insert(values).select("id").single();
  if (error || !data?.id) throw error ?? new Error(`Could not seed ${table}`);
  return data.id as string;
}

async function countById(table: string, id: string) {
  const { count, error } = await regressionAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("id", id);
  if (error) throw error;
  return count ?? 0;
}

test.describe("@account disposable account lifecycle", () => {
  test.skip(!canRunSeededRegression(), "Requires prepared ContrataCR/SG test fixtures.");

  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  test("the two permanent regression actors cannot be deleted", async ({ page }) => {
    for (const actor of [E2E_USERS.client, E2E_USERS.professional]) {
      await loginAs(page, actor.email, actor.password);
      const response = await apiJson<{ error?: string }>(page, "/api/account/delete", { method: "POST" });
      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/regresi[oó]n|regression/i);
    }
    expect(await countById("profiles", seed.clientId)).toBe(1);
    expect(await countById("profiles", seed.professionalUserId)).toBe(1);
  });

  test("a completed anonymized deletion request is idempotent", async () => {
    const admin = regressionAdminClient();
    const requestId = await insertId("account_deletion_requests", {
      user_id: null,
      status: "completed",
      completed_at: new Date().toISOString(),
    });
    try {
      const { data, error } = await admin.rpc("finalize_account_deletion", { p_request_id: requestId });
      expect(error).toBeNull();
      expect(data).toBe(true);
    } finally {
      const { error } = await admin.from("account_deletion_requests").delete().eq("id", requestId);
      expect(error).toBeNull();
    }
  });

  test("password change uses a disposable account and leaves the fixed actors untouched", async ({ page }) => {
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "password-cycle" });
      const nextPassword = `Changed!${Date.now()}aA1`;
      await loginAs(page, account.email, account.password);
      await gotoOK(page, "/en/dashboard/profesional?tab=cuenta&mode=use");

      await page.getByRole("button", { name: /Change password/i }).filter({ visible: true }).click();
      await page.getByPlaceholder(/Current password/i).fill(account.password);
      await page.getByPlaceholder(/^New password/i).fill(nextPassword);
      await page.getByPlaceholder(/Repeat (?:the )?new password|Confirm password/i).fill(nextPassword);
      await page.getByRole("button", { name: /Save password/i }).filter({ visible: true }).click();
      await expect(page.getByPlaceholder(/Current password/i)).toBeHidden({ timeout: 15_000 });

      await resetAuth(page);
      await loginAs(page, account.email, nextPassword);
      await expect(page).toHaveURL(/dashboard\/profesional/);
      await expectHealthyPage(page);
      expect(await countById("profiles", seed.clientId)).toBe(1);
      expect(await countById("profiles", seed.professionalUserId)).toBe(1);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });

  test("disable, sign-out and automatic reactivation preserve the English locale", async ({ page }) => {
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "disable-cycle" });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, "/en/dashboard/profesional?tab=cuenta&mode=use");

      await page.getByRole("button", { name: /^Disable account$/i }).filter({ visible: true }).click();
      await page.getByPlaceholder(/I no longer need the service/i).fill("Disposable regression cycle");
      await page.getByRole("button", { name: /^Confirm disable$/i }).filter({ visible: true }).click();
      await page.waitForURL(/\/en(?:\?|$)/, { timeout: 20_000 });
      await expect(page).toHaveURL(/\/en(?:\?|$)/);

      await expect.poll(async () => {
        const { data } = await regressionAdminClient().from("profiles").select("is_disabled").eq("id", account!.id).single();
        return data?.is_disabled;
      }).toBe(true);

      // Login is the documented recovery path and must reactivate the same row.
      await loginAs(page, account.email, account.password);
      await expect.poll(async () => {
        const { data } = await regressionAdminClient().from("profiles").select("is_disabled").eq("id", account!.id).single();
        return data?.is_disabled;
      }).toBe(false);
      expect(await countById("profiles", seed.clientId)).toBe(1);
      expect(await countById("profiles", seed.professionalUserId)).toBe(1);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });

  test("permanent deletion removes only the populated target and returns to the English home", async ({ page }) => {
    test.setTimeout(240_000);
    const admin = regressionAdminClient();
    let target: DisposableAccount | undefined;
    let sentinel: DisposableAccount | undefined;
    let targetPath = "";
    let sentinelPath = "";
    let targetConversationPath = "";
    let targetJobResumePath = "";
    const cleanupNotificationData: Array<Record<string, string>> = [];
    const bookingIds: string[] = [];
    const supportTicketIds: string[] = [];
    const supportMessageIds: string[] = [];
    const reportIds: string[] = [];
    const auditIds: string[] = [];
    let targetDeletionRequestId = "";

    try {
      target = await createDisposableAccount({ prefix: "deletion-target", professional: true });
      sentinel = await createDisposableAccount({ prefix: "deletion-sentinel", professional: true });
      expect(target.professionalId).toBeTruthy();
      expect(sentinel.professionalId).toBeTruthy();
      const stamp = Date.now();
      const targetBookingId = await insertId("bookings", {
        professional_id: seed.professionalId,
        client_id: target.id,
        client_name: "Deletion target",
        client_email: target.email,
        client_phone: "+50670001111",
        service_description: `Deletion target booking ${stamp}`,
        status: "confirmed",
      });
      bookingIds.push(targetBookingId);
      cleanupNotificationData.push({ booking_id: targetBookingId });
      const sentinelBookingId = await insertId("bookings", {
        professional_id: seed.professionalId,
        client_id: sentinel.id,
        client_name: "Deletion sentinel",
        client_email: sentinel.email,
        client_phone: "+50670002222",
        service_description: `Deletion sentinel booking ${stamp}`,
        status: "confirmed",
      });
      bookingIds.push(sentinelBookingId);
      cleanupNotificationData.push({ booking_id: sentinelBookingId });

      const targetProjectId = await insertId("projects", {
        client_id: target.id,
        category_id: seed.categoryId,
        title: `Deletion target project ${stamp}`,
        description: "Project owned only by the disposable deletion target.",
        status: "open",
      });
      cleanupNotificationData.push({ project_id: targetProjectId });
      const sentinelProjectId = await insertId("projects", {
        client_id: sentinel.id,
        category_id: seed.categoryId,
        title: `Deletion sentinel project ${stamp}`,
        description: "Unrelated project that must remain after target deletion.",
        status: "open",
      });
      cleanupNotificationData.push({ project_id: sentinelProjectId });

      const targetJobId = await insertId("job_posts", {
        employer_id: target.professionalId,
        title: `Deletion target job ${stamp}`,
        description: "Disposable job used to verify a scoped account deletion cascade.",
        employment_type: "contract",
        workplace_type: "remote",
        salary_period: "project",
        currency: "CRC",
        status: "draft",
      });
      cleanupNotificationData.push({ job_id: targetJobId });
      const sentinelJobId = await insertId("job_posts", {
        employer_id: sentinel.professionalId,
        title: `Deletion sentinel job ${stamp}`,
        description: "Unrelated job that must remain after target account deletion.",
        employment_type: "contract",
        workplace_type: "remote",
        salary_period: "project",
        currency: "CRC",
        status: "draft",
      });
      cleanupNotificationData.push({ job_id: sentinelJobId });
      const targetOfferId = await insertId("professional_offers", {
        professional_id: target.professionalId,
        title: `Deletion target offer ${stamp}`,
        description: "Disposable offer used only by the account deletion regression.",
        offer_type: "service_offer",
        currency: "CRC",
        price_unit: "total",
        status: "draft",
      });
      cleanupNotificationData.push({ offer_id: targetOfferId });
      const sentinelOfferId = await insertId("professional_offers", {
        professional_id: sentinel.professionalId,
        title: `Deletion sentinel offer ${stamp}`,
        description: "Unrelated offer that must remain after target account deletion.",
        offer_type: "service_offer",
        currency: "CRC",
        price_unit: "total",
        status: "draft",
      });
      cleanupNotificationData.push({ offer_id: sentinelOfferId });

      const targetApplicationId = await insertId("job_applications", {
        job_id: seed.publishedJobId,
        applicant_id: target.id,
        applicant_email: target.email,
        cover_letter: "Disposable target application for isolated deletion testing.",
        status: "submitted",
      });
      cleanupNotificationData.push(
        { application_id: targetApplicationId },
        { applicant_id: target.id },
      );
      const sentinelApplicationId = await insertId("job_applications", {
        job_id: seed.secondaryJobId,
        applicant_id: sentinel.id,
        applicant_email: sentinel.email,
        cover_letter: "Unrelated sentinel application that must remain after deletion.",
        status: "submitted",
      });
      cleanupNotificationData.push(
        { application_id: sentinelApplicationId },
        { applicant_id: sentinel.id },
      );
      const sentinelApplicationToTargetJobId = await insertId("job_applications", {
        job_id: targetJobId,
        applicant_id: sentinel.id,
        applicant_email: sentinel.email,
        cover_letter: "Sentinel CV attached to a target-owned job.",
        status: "submitted",
      });

      const targetSavedId = await insertId("saved_items", {
        user_id: target.id,
        item_type: "job",
        item_id: seed.publishedJobId,
        snapshot: { title: "Target saved job" },
      });
      const sentinelSavedId = await insertId("saved_items", {
        user_id: sentinel.id,
        item_type: "offer",
        item_id: seed.publishedOfferId,
        snapshot: { title: "Sentinel saved offer" },
      });
      const targetFollowId = await insertId("professional_follows", {
        follower_id: target.id,
        professional_id: seed.professionalId,
      });
      cleanupNotificationData.push({ follower_id: target.id });
      const sentinelFollowId = await insertId("professional_follows", {
        follower_id: sentinel.id,
        professional_id: seed.professionalId,
      });
      cleanupNotificationData.push({ follower_id: sentinel.id });

      const targetTicketId = await insertId("support_tickets", {
        user_id: target.id,
        name: "Deletion target",
        email: target.email,
        subject: `Deletion target support ${stamp}`,
        detail: "Sensitive target legacy support detail",
        message: "Sensitive target support body",
        status: "open",
      });
      supportTicketIds.push(targetTicketId);
      const sentinelTicketId = await insertId("support_tickets", {
        user_id: sentinel.id,
        name: "Deletion sentinel",
        email: sentinel.email,
        subject: `Deletion sentinel support ${stamp}`,
        detail: "Sentinel legacy support detail",
        message: "Sentinel support body",
        status: "open",
      });
      supportTicketIds.push(sentinelTicketId);
      await insertId("support_ticket_messages", {
        ticket_id: targetTicketId,
        sender_role: "user",
        sender_id: target.id,
        sender_name: "Deletion target",
        body: "Sensitive target thread body",
      });
      await insertId("support_ticket_messages", {
        ticket_id: targetTicketId,
        sender_role: "admin",
        sender_id: null,
        sender_name: "Soporte ContrataCR",
        body: `Admin reply quoting private target data: ${target.email}`,
      });
      await insertId("support_ticket_messages", {
        ticket_id: sentinelTicketId,
        sender_role: "user",
        sender_id: sentinel.id,
        sender_name: "Deletion sentinel",
        body: "Sentinel thread body",
      });
      await insertId("support_ticket_messages", {
        ticket_id: sentinelTicketId,
        sender_role: "admin",
        sender_id: null,
        sender_name: "Soporte ContrataCR",
        body: `Independent admin reply for ${sentinel.email}`,
      });

      const targetConversationId = await insertId("direct_conversations", {
        client_id: target.id,
        professional_id: sentinel.professionalId,
        professional_profile_id: sentinel.id,
        subject: "Target conversation with a sentinel attachment",
        status: "open",
      });
      targetConversationPath = `${targetConversationId}/${sentinel.id}/sentinel-to-target.png`;
      await insertId("direct_messages", {
        conversation_id: targetConversationId,
        sender_id: sentinel.id,
        body: "Sentinel attachment in a conversation owned by the target lifecycle.",
        attachment_urls: [{
          path: targetConversationPath,
          name: "sentinel-to-target.png",
          type: "image/png",
          size: 8,
        }],
      });

      const targetSupportMessageId = await insertId("support_messages", {
        user_id: target.id,
        name: "Deletion target",
        email: target.email,
        subject: `Deletion target legacy support ${stamp}`,
        message: "Sensitive target legacy support body",
        status: "pending",
      });
      supportMessageIds.push(targetSupportMessageId);
      const sentinelSupportMessageId = await insertId("support_messages", {
        user_id: sentinel.id,
        name: "Deletion sentinel",
        email: sentinel.email,
        subject: `Deletion sentinel legacy support ${stamp}`,
        message: "Sentinel legacy support body",
        status: "pending",
      });
      supportMessageIds.push(sentinelSupportMessageId);

      const historicalTargetEmail = `historical_target-${stamp}@contratacr.test`;
      const unrelatedLookalikeEmail = `historicalXtarget-${stamp}@contratacr.test`;
      const targetAuthoredReportId = await insertId("reports", {
        professional_id: sentinel.professionalId,
        professional_slug: "sentinel-report-subject",
        professional_name: "Sentinel report subject",
        reason: "Target-authored report about an account that must remain.",
        reporter_email: historicalTargetEmail,
        status: "open",
      });
      reportIds.push(targetAuthoredReportId);
      const sentinelReportAboutTargetId = await insertId("reports", {
        professional_id: target.professionalId,
        professional_slug: "target-report-subject",
        professional_name: "Target report subject",
        reason: "Sentinel-authored report about the deletion target.",
        reporter_email: sentinel.email,
        status: "open",
      });
      reportIds.push(sentinelReportAboutTargetId);

      const targetRelatedAuditId = await insertId("user_action_audit", {
        actor_user_id: sentinel.id,
        actor_role: "professional",
        action: "regression.target_related_audit",
        entity_table: "profiles",
        entity_id: target.id,
        entity_owner_user_id: sentinel.id,
        request_method: "PATCH",
        request_path: `/admin/users/${target.id}`,
        request_host: "test.contratacr.com",
        request_ip: "192.0.2.10",
        user_agent: "ContrataCR regression sentinel",
        referer: `https://test.contratacr.com/admin?email=${target.email}`,
        before_data: { id: target.id, email: historicalTargetEmail },
        after_data: { role: "professional" },
        metadata: { target_user_id: target.id },
      });
      auditIds.push(targetRelatedAuditId);
      const sentinelAuditId = await insertId("user_action_audit", {
        actor_user_id: sentinel.id,
        actor_role: "professional",
        action: "regression.sentinel_audit",
        entity_table: "profiles",
        entity_id: sentinel.id,
        entity_owner_user_id: sentinel.id,
        request_method: "PATCH",
        request_path: `/admin/users/${sentinel.id}`,
        request_host: "test.contratacr.com",
        request_ip: "192.0.2.20",
        user_agent: "ContrataCR regression sentinel",
        referer: "https://test.contratacr.com/admin/sentinel",
        before_data: { id: sentinel.id, email: sentinel.email },
        after_data: { role: "professional" },
        metadata: { sentinel_user_id: sentinel.id },
      });
      auditIds.push(sentinelAuditId);

      targetPath = `account-deletion-regression/${target.id}/target.png`;
      sentinelPath = `account-deletion-regression/${sentinel.id}/sentinel.png`;
      targetJobResumePath = `job-applications/${targetJobId}/${sentinel.id}/sentinel-cv.pdf`;
      const { error: targetResumeError } = await admin.from("job_applications")
        .update({ resume_url: targetJobResumePath })
        .eq("id", sentinelApplicationToTargetJobId);
      expect(targetResumeError).toBeNull();
      for (const path of [targetPath, sentinelPath, targetConversationPath, targetJobResumePath]) {
        const { error } = await admin.storage.from("direct-message-attachments")
          .upload(path, Buffer.from("89504e470d0a1a0a", "hex"), {
            contentType: path.endsWith(".pdf") ? "application/pdf" : "image/png",
            upsert: false,
          });
        if (error) throw error;
      }
      // Keep provider cleanup out of the deterministic browser suite: a fake
      // Cloudinary id still makes the deployed route call an external provider.
      // The sentinel row proves scoped registry isolation without introducing
      // a network dependency or risking a real asset.
      const sentinelMediaPublicId = `contratacr/regression/missing-sentinel-${stamp}`;
      const { error: mediaInsertError } = await admin.from("user_media_assets").insert({
        user_id: sentinel.id,
        provider: "cloudinary",
        public_id: sentinelMediaPublicId,
        resource_type: "image",
      });
      expect(mediaInsertError).toBeNull();

      // Explicit cross-account alerts exercise rows that do not have a foreign
      // key to the deleted account but are still related to it through JSON.
      const targetCrossNotificationId = await insertId("notifications", {
        user_id: sentinel.id,
        type: "job_application",
        title: "Target-related cross notification",
        message: "Must disappear with the target only.",
        data: { applicant_id: target.id, application_id: targetApplicationId },
      });
      const sentinelNotificationId = await insertId("notifications", {
        user_id: sentinel.id,
        type: "booking_received",
        title: "Sentinel notification",
        message: "Must remain after target deletion.",
        data: { sentinel_id: sentinel.id },
      });
      const literalEmailIsolationNotificationId = await insertId("notifications", {
        user_id: sentinel.id,
        type: "booking_received",
        title: "Literal email isolation notification",
        message: "An underscore in another account email must not act as a wildcard.",
        data: { email: unrelatedLookalikeEmail },
      });

      await loginAs(page, target.email, target.password);
      await gotoOK(page, "/en/dashboard/profesional?tab=cuenta&mode=use");
      // Keep the request id deterministic for the isolation assertions, but
      // only mark deletion as pending after the user has authenticated and the
      // account page is open. Pending accounts are intentionally denied login.
      targetDeletionRequestId = await insertId("account_deletion_requests", {
        user_id: target.id,
        status: "pending",
      });
      await page.getByRole("button", { name: /^Delete account$/i }).filter({ visible: true }).click();
      await page.getByRole("button", { name: /^Confirm deletion$/i }).filter({ visible: true }).click();
      await page.waitForURL(/\/en\?accountDeletion=(?:completed|pending)/, { timeout: 45_000 });
      await expect(page.getByRole("status")).toContainText(/Your account (?:was deleted|deletion has started)/i);
      await expectHealthyPage(page);

      await expect.poll(async () => {
        const { data, error } = await admin.auth.admin.getUserById(target!.id);
        if (error && !/not found/i.test(error.message)) throw error;
        return data.user?.id ?? null;
      }, { timeout: 30_000 }).toBeNull();

      const { data: completedDeletion, error: completedDeletionError } = await admin
        .from("account_deletion_requests")
        .select("id,status,user_id")
        .eq("id", targetDeletionRequestId)
        .single();
      expect(completedDeletionError).toBeNull();
      expect(completedDeletion).toEqual(expect.objectContaining({ status: "completed", user_id: null }));
      expect(completedDeletion?.id).toBe(targetDeletionRequestId);

      for (const [table, id] of [
        ["profiles", target.id],
        ["professionals", target.professionalId!],
        ["bookings", targetBookingId],
        ["projects", targetProjectId],
        ["job_posts", targetJobId],
        ["professional_offers", targetOfferId],
        ["job_applications", targetApplicationId],
        ["job_applications", sentinelApplicationToTargetJobId],
        ["direct_conversations", targetConversationId],
        ["saved_items", targetSavedId],
        ["professional_follows", targetFollowId],
        ["notifications", targetCrossNotificationId],
      ] as const) {
        expect(await countById(table, id), `${table}:${id} should be removed`).toBe(0);
      }
      const { data: targetTicket, error: targetTicketError } = await admin.from("support_tickets")
        .select("user_id,name,email,subject,detail,message")
        .eq("id", targetTicketId)
        .single();
      expect(targetTicketError).toBeNull();
      expect(targetTicket).toEqual(expect.objectContaining({
        user_id: null,
        name: "Cuenta eliminada",
        email: "eliminada@anonimo.invalid",
        subject: "Cuenta eliminada",
        detail: "[Contenido eliminado por solicitud del usuario]",
        message: "[Contenido eliminado por solicitud del usuario]",
      }));
      const { data: targetThread, error: targetThreadError } = await admin.from("support_ticket_messages")
        .select("sender_id,sender_name,body")
        .eq("ticket_id", targetTicketId);
      expect(targetThreadError).toBeNull();
      expect(targetThread).toHaveLength(2);
      for (const message of targetThread ?? []) {
        expect(message).toEqual(expect.objectContaining({
          sender_id: null,
          sender_name: "Cuenta eliminada",
          body: "[Contenido eliminado por solicitud del usuario]",
        }));
      }
      const { data: targetSupportMessage, error: targetSupportMessageError } = await admin.from("support_messages")
        .select("user_id,name,email,subject,message")
        .eq("id", targetSupportMessageId)
        .single();
      expect(targetSupportMessageError).toBeNull();
      expect(targetSupportMessage).toEqual(expect.objectContaining({
        user_id: null,
        name: "Cuenta eliminada",
        email: "eliminada@anonimo.invalid",
        subject: "Cuenta eliminada",
        message: "[Contenido eliminado por solicitud del usuario]",
      }));

      const { data: targetAuthoredReport, error: targetAuthoredReportError } = await admin.from("reports")
        .select("professional_id,professional_slug,professional_name,reason,reporter_email")
        .eq("id", targetAuthoredReportId)
        .single();
      expect(targetAuthoredReportError).toBeNull();
      expect(targetAuthoredReport).toEqual(expect.objectContaining({
        professional_id: sentinel.professionalId,
        professional_slug: "sentinel-report-subject",
        professional_name: "Sentinel report subject",
        reason: "Target-authored report about an account that must remain.",
        reporter_email: null,
      }));
      const { data: sentinelReportAboutTarget, error: sentinelReportAboutTargetError } = await admin.from("reports")
        .select("professional_id,professional_slug,professional_name,reason,reporter_email")
        .eq("id", sentinelReportAboutTargetId)
        .single();
      expect(sentinelReportAboutTargetError).toBeNull();
      expect(sentinelReportAboutTarget).toEqual(expect.objectContaining({
        professional_id: null,
        professional_slug: null,
        professional_name: "Cuenta eliminada",
        reason: "[Contenido eliminado por solicitud del usuario]",
        reporter_email: sentinel.email,
      }));
      const { data: targetRelatedAudit, error: targetRelatedAuditError } = await admin.from("user_action_audit")
        .select("actor_user_id,actor_role,entity_id,entity_owner_user_id,request_method,request_path,request_host,request_ip,user_agent,referer,before_data,after_data,metadata")
        .eq("id", targetRelatedAuditId)
        .single();
      expect(targetRelatedAuditError).toBeNull();
      expect(targetRelatedAudit).toEqual(expect.objectContaining({
        actor_user_id: sentinel.id,
        actor_role: "professional",
        entity_id: null,
        entity_owner_user_id: sentinel.id,
        request_method: "PATCH",
        request_path: null,
        request_host: "test.contratacr.com",
        request_ip: "192.0.2.10",
        user_agent: "ContrataCR regression sentinel",
        referer: null,
        before_data: null,
        after_data: null,
        metadata: { account_deleted: true },
      }));
      const { data: sentinelAudit, error: sentinelAuditError } = await admin.from("user_action_audit")
        .select("actor_user_id,actor_role,entity_id,entity_owner_user_id,request_method,request_path,request_host,request_ip,user_agent,referer,before_data,after_data,metadata")
        .eq("id", sentinelAuditId)
        .single();
      expect(sentinelAuditError).toBeNull();
      expect(sentinelAudit).toEqual(expect.objectContaining({
        actor_user_id: sentinel.id,
        actor_role: "professional",
        entity_id: sentinel.id,
        entity_owner_user_id: sentinel.id,
        request_method: "PATCH",
        request_path: `/admin/users/${sentinel.id}`,
        request_host: "test.contratacr.com",
        request_ip: "192.0.2.20",
        user_agent: "ContrataCR regression sentinel",
        referer: "https://test.contratacr.com/admin/sentinel",
        before_data: { id: sentinel.id, email: sentinel.email },
        after_data: { role: "professional" },
        metadata: { sentinel_user_id: sentinel.id },
      }));
      const { data: targetStorage, error: targetStorageError } = await admin.storage.from("direct-message-attachments")
        .list(`account-deletion-regression/${target.id}`);
      expect(targetStorageError).toBeNull();
      expect(targetStorage).toHaveLength(0);
      const { data: targetConversationStorage, error: targetConversationStorageError } = await admin.storage
        .from("direct-message-attachments")
        .list(targetConversationPath.slice(0, targetConversationPath.lastIndexOf("/")));
      expect(targetConversationStorageError).toBeNull();
      expect(targetConversationStorage).toHaveLength(0);
      const { data: targetJobStorage, error: targetJobStorageError } = await admin.storage
        .from("direct-message-attachments")
        .list(targetJobResumePath.slice(0, targetJobResumePath.lastIndexOf("/")));
      expect(targetJobStorageError).toBeNull();
      expect(targetJobStorage).toHaveLength(0);
      const { count: targetMediaCount, error: targetMediaError } = await admin.from("user_media_assets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", target.id);
      expect(targetMediaError).toBeNull();
      expect(targetMediaCount ?? 0).toBe(0);

      const { data: sentinelAuth, error: sentinelAuthError } = await admin.auth.admin.getUserById(sentinel.id);
      expect(sentinelAuthError).toBeNull();
      expect(sentinelAuth.user?.id).toBe(sentinel.id);
      for (const [table, id] of [
        ["profiles", sentinel.id],
        ["professionals", sentinel.professionalId!],
        ["bookings", sentinelBookingId],
        ["projects", sentinelProjectId],
        ["job_posts", sentinelJobId],
        ["professional_offers", sentinelOfferId],
        ["job_applications", sentinelApplicationId],
        ["saved_items", sentinelSavedId],
        ["professional_follows", sentinelFollowId],
        ["notifications", sentinelNotificationId],
        ["notifications", literalEmailIsolationNotificationId],
      ] as const) {
        expect(await countById(table, id), `${table}:${id} should remain`).toBe(1);
      }
      const { data: sentinelTicket, error: sentinelTicketError } = await admin.from("support_tickets")
        .select("user_id,name,email,subject,detail,message")
        .eq("id", sentinelTicketId)
        .single();
      expect(sentinelTicketError).toBeNull();
      expect(sentinelTicket).toEqual(expect.objectContaining({
        user_id: sentinel.id,
        name: "Deletion sentinel",
        email: sentinel.email,
        subject: `Deletion sentinel support ${stamp}`,
        detail: "Sentinel legacy support detail",
        message: "Sentinel support body",
      }));
      const { data: sentinelThread, error: sentinelThreadError } = await admin.from("support_ticket_messages")
        .select("sender_id,sender_name,body")
        .eq("ticket_id", sentinelTicketId);
      expect(sentinelThreadError).toBeNull();
      expect(sentinelThread).toHaveLength(2);
      expect(sentinelThread).toEqual(expect.arrayContaining([expect.objectContaining({
        sender_id: sentinel.id,
        sender_name: "Deletion sentinel",
        body: "Sentinel thread body",
      }), expect.objectContaining({
        sender_id: null,
        sender_name: "Soporte ContrataCR",
        body: `Independent admin reply for ${sentinel.email}`,
      })]));
      const { data: sentinelSupportMessage, error: sentinelSupportMessageError } = await admin.from("support_messages")
        .select("user_id,name,email,subject,message")
        .eq("id", sentinelSupportMessageId)
        .single();
      expect(sentinelSupportMessageError).toBeNull();
      expect(sentinelSupportMessage).toEqual(expect.objectContaining({
        user_id: sentinel.id,
        name: "Deletion sentinel",
        email: sentinel.email,
        subject: `Deletion sentinel legacy support ${stamp}`,
        message: "Sentinel legacy support body",
      }));
      const { data: sentinelMedia, error: sentinelMediaError } = await admin.from("user_media_assets")
        .select("public_id")
        .eq("user_id", sentinel.id)
        .eq("public_id", sentinelMediaPublicId)
        .single();
      expect(sentinelMediaError).toBeNull();
      expect(sentinelMedia?.public_id).toBe(sentinelMediaPublicId);
      const { data: sentinelStorage, error: sentinelStorageError } = await admin.storage.from("direct-message-attachments")
        .list(`account-deletion-regression/${sentinel.id}`);
      expect(sentinelStorageError).toBeNull();
      expect(sentinelStorage ?? []).toEqual(expect.arrayContaining([expect.objectContaining({ name: "sentinel.png" })]));
      expect(await countById("profiles", seed.clientId)).toBe(1);
      expect(await countById("profiles", seed.professionalUserId)).toBe(1);
    } finally {
      const cleanupFailures: unknown[] = [];
      for (const data of cleanupNotificationData) {
        const { error } = await admin.from("notifications").delete().contains("data", data);
        if (error) cleanupFailures.push(error);
      }
      if (bookingIds.length) {
        const { error } = await admin.from("bookings").delete().in("id", bookingIds);
        if (error) cleanupFailures.push(error);
      }
      if (targetPath) {
        const { error } = await admin.storage.from("direct-message-attachments").remove([targetPath]);
        if (error) cleanupFailures.push(error);
      }
      if (sentinelPath) {
        const { error } = await admin.storage.from("direct-message-attachments").remove([sentinelPath]);
        if (error) cleanupFailures.push(error);
      }
      for (const path of [targetConversationPath, targetJobResumePath].filter(Boolean)) {
        const { error } = await admin.storage.from("direct-message-attachments").remove([path]);
        if (error) cleanupFailures.push(error);
      }
      if (supportTicketIds.length) {
        const { error: threadError } = await admin.from("support_ticket_messages").delete().in("ticket_id", supportTicketIds);
        if (threadError) cleanupFailures.push(threadError);
        const { error: ticketError } = await admin.from("support_tickets").delete().in("id", supportTicketIds);
        if (ticketError) cleanupFailures.push(ticketError);
      }
      if (supportMessageIds.length) {
        const { error } = await admin.from("support_messages").delete().in("id", supportMessageIds);
        if (error) cleanupFailures.push(error);
      }
      if (reportIds.length) {
        const { error } = await admin.from("reports").delete().in("id", reportIds);
        if (error) cleanupFailures.push(error);
      }
      if (auditIds.length) {
        const { error } = await admin.from("user_action_audit").delete().in("id", auditIds);
        if (error) cleanupFailures.push(error);
      }
      if (targetDeletionRequestId) {
        const { error } = await admin.from("account_deletion_requests").delete().eq("id", targetDeletionRequestId);
        if (error) cleanupFailures.push(error);
      }
      for (const account of [target, sentinel]) {
        try {
          await cleanupDisposableAccount(account);
        } catch (error) {
          cleanupFailures.push(error);
        }
      }
      if (cleanupFailures.length) throw new AggregateError(cleanupFailures, "Account lifecycle cleanup failed");
    }
  });
});
