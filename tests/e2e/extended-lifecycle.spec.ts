import { expect, test } from "playwright/test";
import { apiJson, expectHealthyPage, expectVisibleText, gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

type IdResponse = { id?: string; ok?: boolean; edited?: boolean; error?: string };

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9Z8AAAAASUVORK5CYII=",
  "base64",
);

test.describe.configure({ mode: "serial" });

test.describe("@seeded extended lifecycle", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_SEED=1 with test Supabase secrets.");

  let seed: RegressionSeedState;

  test.beforeEach(async () => {
    seed = await ensureRegressionSeed();
  });

  test("completed work supports one editable review tied to that exact request", async ({ page }) => {
    const admin = regressionAdminClient();
    const marker = `E2E review ${Date.now()}`;
    let bookingId = "";

    try {
      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      const created = await apiJson<IdResponse>(page, "/api/bookings", {
        method: "POST",
        body: {
          professionalId: seed.professionalId,
          clientName: E2E_USERS.client.fullName,
          clientEmail: E2E_USERS.client.email,
          clientPhone: E2E_USERS.client.phone,
          serviceDescription: marker,
          scheduledDate: seed.slotDate,
          scheduledTime: "11:00",
          categoryId: seed.categoryId,
          slotLocationId: "e2e-main",
          slotLocationLabel: "Alajuela, Alajuela",
        },
      });
      expect(created.status).toBe(200);
      bookingId = created.body.id ?? "";
      expect(bookingId).toBeTruthy();

      await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
      expect((await apiJson(page, "/api/bookings", { method: "PATCH", body: { id: bookingId, status: "awaiting_confirmation" } })).status).toBe(200);

      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      expect((await apiJson(page, "/api/bookings", { method: "PATCH", body: { id: bookingId, status: "completed" } })).status).toBe(200);

      const first = await apiJson<IdResponse>(page, "/api/reviews", {
        method: "POST",
        body: { professionalId: seed.professionalId, bookingId, rating: 4.5, comment: `${marker} initial` },
      });
      expect(first.status).toBe(200);
      expect(first.body.edited).toBe(false);

      const edited = await apiJson<IdResponse>(page, "/api/reviews", {
        method: "POST",
        body: { professionalId: seed.professionalId, bookingId, rating: 5, comment: `${marker} edited` },
      });
      expect(edited.status).toBe(200);
      expect(edited.body.edited).toBe(true);

      const mine = await apiJson<{ review?: { rating?: number; comment?: string } }>(page, `/api/reviews?bookingId=${bookingId}`);
      expect(mine.status).toBe(200);
      expect(mine.body.review).toEqual(expect.objectContaining({ rating: 5, comment: `${marker} edited` }));

      const { data: rows, error } = await admin.from("reviews").select("id, booking_id, rating, comment").eq("booking_id", bookingId);
      if (error) throw error;
      expect(rows).toHaveLength(1);
      expect(rows?.[0]).toEqual(expect.objectContaining({ rating: 5, comment: `${marker} edited` }));
    } finally {
      if (bookingId) {
        await admin.from("reviews").delete().eq("booking_id", bookingId);
        await admin.from("notifications").delete().contains("data", { booking_id: bookingId });
        await admin.from("bookings").delete().eq("id", bookingId);
      }
    }
  });

  test("guest and signed-in support tickets persist their acknowledgement and conversation lifecycle", async ({ page }) => {
    const admin = regressionAdminClient();
    const stamp = Date.now();
    const guestSubject = `E2E guest support ${stamp}`;
    const userSubject = `E2E user support ${stamp}`;
    const ticketIds: string[] = [];

    try {
      await resetAuth(page);
      const guest = await apiJson<{ ok?: boolean }>(page, "/api/contact", {
        method: "POST",
        body: {
          name: "E2E Guest",
          email: `guest-${stamp}@contratacr.test`,
          subject: guestSubject,
          topic: "subject1",
          message: "E2E guest support message",
          locale: "en",
        },
      });
      expect(guest.status).toBe(200);
      expect(guest.body.ok).toBe(true);

      await expect.poll(async () => {
        const { data } = await admin.from("support_tickets").select("id, user_id").eq("subject", guestSubject).maybeSingle();
        return data;
      }, { timeout: 10_000 }).not.toBeNull();
      const { data: storedGuest } = await admin.from("support_tickets").select("id, user_id").eq("subject", guestSubject).single();
      ticketIds.push(storedGuest!.id);
      expect(storedGuest!.user_id).toBeNull();
      const { data: guestMessages } = await admin.from("support_ticket_messages").select("sender_role, body").eq("ticket_id", storedGuest!.id).order("created_at");
      expect(guestMessages).toHaveLength(2);
      expect(guestMessages?.[1].body).toMatch(/support ticket|review it|respond/i);

      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      const signedIn = await apiJson<{ ok?: boolean }>(page, "/api/contact", {
        method: "POST",
        body: { subject: userSubject, topic: "subject2", message: "E2E signed-in support message", locale: "es" },
      });
      expect(signedIn.status).toBe(200);

      await expect.poll(async () => {
        const { data } = await admin.from("support_tickets").select("id, user_id, status").eq("subject", userSubject).maybeSingle();
        return data;
      }, { timeout: 10_000 }).not.toBeNull();
      const { data: userTicket, error: userTicketError } = await admin
        .from("support_tickets")
        .select("id, user_id, status")
        .eq("subject", userSubject)
        .single();
      if (userTicketError || !userTicket) throw userTicketError ?? new Error("Signed-in support ticket was not stored");
      ticketIds.push(userTicket!.id);
      expect(userTicket!.user_id).toBe(seed.clientId);

      expect((await apiJson(page, "/api/support", { method: "POST", body: { ticketId: userTicket!.id, body: "E2E follow-up" } })).status).toBe(200);
      await admin.from("support_tickets").update({ status: "resolved" }).eq("id", userTicket!.id);
      expect((await apiJson(page, "/api/support", { method: "POST", body: { ticketId: userTicket!.id, action: "reopen", body: "Still needs help" } })).status).toBe(200);
      expect((await apiJson(page, "/api/support", { method: "POST", body: { ticketId: userTicket!.id, action: "confirm" } })).status).toBe(200);

      const { data: finalTicket } = await admin.from("support_tickets").select("status, user_confirmed").eq("id", userTicket!.id).single();
      expect(finalTicket).toEqual(expect.objectContaining({ status: "resolved", user_confirmed: true }));
    } finally {
      if (ticketIds.length) {
        await admin.from("support_ticket_messages").delete().in("ticket_id", ticketIds);
        await admin.from("support_tickets").delete().in("id", ticketIds);
      }
    }
  });

  test("account password change works end to end and the seeded credential is restored", async ({ page }) => {
    const admin = regressionAdminClient();
    const temporaryPassword = "ContrataCR!2026Temporary";

    try {
      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      await gotoOK(page, "/es/dashboard/profesional?tab=cuenta&mode=use");
      const change = page.getByRole("button", { name: /Cambiar contrase/i }).filter({ visible: true });
      await expect(change).toHaveCount(1);
      await change.click();

      await page.getByPlaceholder(/Contrase.a actual/i).fill(E2E_USERS.client.password);
      await page.getByPlaceholder(/^Nueva contrase.a/i).fill(temporaryPassword);
      await page.getByPlaceholder(/Repite la nueva contrase.a|Repetir contrase.a|Confirmar contrase.a/i).fill(temporaryPassword);
      await page.getByRole("button", { name: /Guardar contrase/i }).click();
      await expect(page.getByPlaceholder(/Contrase.a actual/i)).toBeHidden({ timeout: 15_000 });

      await resetAuth(page);
      await loginAs(page, E2E_USERS.client.email, temporaryPassword);
      await expect(page).toHaveURL(/dashboard\/profesional/);
    } finally {
      await admin.auth.admin.updateUserById(seed.clientId, { password: E2E_USERS.client.password, email_confirm: true });
    }
  });

  test("professional profile and service edits persist through their real UI", async ({ page }) => {
    const admin = regressionAdminClient();
    const marker = `E2E profile ${Date.now()}`;
    const { data: before, error } = await admin.from("professionals").select("bio, services").eq("id", seed.professionalId).single();
    if (error) throw error;

    try {
      await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
      await gotoOK(page, "/es/dashboard/profesional?tab=profile&mode=offer");
      await page.getByRole("button", { name: /Datos b.sicos.*Foto, nombre y descripci/i }).click();
      const bio = page.locator('[data-field="bio"] textarea');
      await expect(bio).toBeVisible();
      await bio.fill(marker);
      await bio.blur();
      await expect.poll(async () => (await admin.from("professionals").select("bio").eq("id", seed.professionalId).single()).data?.bio).toBe(marker);

      await gotoOK(page, "/es/dashboard/profesional?tab=services&mode=offer");
      const serviceCard = page.locator("section").filter({ hasText: /Plomer/i }).filter({ has: page.getByRole("button", { name: /Editar informaci/i }) });
      await expect(serviceCard).toHaveCount(1);
      await serviceCard.getByRole("button", { name: /Editar informaci/i }).click();
      const dialog = page.getByRole("dialog").filter({ hasText: /Plomer/i });
      await expect(dialog).toBeVisible();
      await dialog.locator("textarea").fill(`${marker} service`);
      await dialog.getByRole("button", { name: /Guardar cambios/i }).click();
      await expect.poll(async () => {
        const { data } = await admin.from("professionals").select("services").eq("id", seed.professionalId).single();
        const services = Array.isArray(data?.services) ? data.services as Array<{ description?: string }> : [];
        return services.some((service) => service.description === `${marker} service`);
      }).toBe(true);
    } finally {
      await admin.from("professionals").update({ bio: before!.bio, services: before!.services }).eq("id", seed.professionalId);
    }
  });

  test("success case creation uploads an image, saves the case, and restores the seed", async ({ page }) => {
    const admin = regressionAdminClient();
    const marker = `E2E success case ${Date.now()}`;
    const { data: before, error } = await admin.from("professionals").select("portfolio_items, portfolio_urls").eq("id", seed.professionalId).single();
    if (error) throw error;

    try {
      await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
      await gotoOK(page, "/es/dashboard/profesional?tab=photos&mode=offer");
      const add = page.getByRole("button", { name: /Agregar.*caso de .xito/i }).filter({ visible: true });
      await expect(add).toHaveCount(1);
      await add.click();

      const dialog = page.getByRole("dialog").filter({ hasText: /Nuevo caso de .xito/i });
      await expect(dialog).toBeVisible();
      await dialog.locator('input[type="file"]').setInputFiles({ name: "e2e-case.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
      await expect(dialog.locator("img")).toHaveCount(1, { timeout: 20_000 });
      await dialog.locator('input[maxlength="80"]').fill(marker);
      await dialog.locator("textarea").fill("Caso creado por la regresion automatizada.");
      await dialog.getByRole("button", { name: /^Guardar$/i }).click();

      await expect.poll(async () => {
        const { data } = await admin.from("professionals").select("portfolio_items").eq("id", seed.professionalId).single();
        const items = Array.isArray(data?.portfolio_items) ? data.portfolio_items as Array<{ title?: string }> : [];
        return items.some((item) => item.title === marker);
      }, { timeout: 20_000 }).toBe(true);
      await expectHealthyPage(page);
    } finally {
      await admin.from("professionals").update({ portfolio_items: before!.portfolio_items, portfolio_urls: before!.portfolio_urls }).eq("id", seed.professionalId);
    }
  });

  test("availability privacy changes persist and can be published again", async ({ page }) => {
    const admin = regressionAdminClient();
    try {
      await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
      await gotoOK(page, "/es/dashboard/profesional?tab=availability&mode=offer");
      const hide = page.getByRole("button", { name: /Hacer privada/i }).filter({ visible: true });
      await expect(hide).toHaveCount(1);
      await hide.click();
      await expectVisibleText(page.locator("body"), /Ocultar tu agenda/i);
      const confirm = page.getByRole("button", { name: /S., ocultar agenda/i }).filter({ visible: true });
      await expect(confirm).toHaveCount(1);
      await confirm.click();
      await expect.poll(async () => (await admin.from("professionals").select("availability_public").eq("id", seed.professionalId).single()).data?.availability_public).toBe(false);

      const publish = page.getByRole("button", { name: /Hacer p.blica/i }).filter({ visible: true });
      await expect(publish).toHaveCount(1);
      await publish.click();
      await expect.poll(async () => (await admin.from("professionals").select("availability_public").eq("id", seed.professionalId).single()).data?.availability_public).toBe(true);
    } finally {
      await ensureRegressionSeed();
    }
  });
});
