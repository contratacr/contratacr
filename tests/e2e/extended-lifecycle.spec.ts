import { expect, test } from "playwright/test";
import { apiJson, expectHealthyPage, expectVisibleText, gotoOK, loginAs, resetAuth } from "./helpers";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

type IdResponse = { id?: string; ok?: boolean; edited?: boolean; error?: string };

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9Z8AAAAASUVORK5CYII=",
  "base64",
);

test.describe.configure({ mode: "serial" });

test.describe("@seeded extended lifecycle", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_FIXTURES_READY=1 with test Supabase secrets.");

  let seed: RegressionSeedState;

  test.beforeEach(async () => {
    seed = await ensureRegressionSeed();
  });

  test("completed work supports one editable review tied to that exact request", async ({ page }) => {
    const admin = regressionAdminClient();
    const marker = `E2E review ${Date.now()}`;
    let bookingId = "";
    let reviewId = "";

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
          slotLocationId: seed.slotLocationId,
          slotLocationLabel: "Alajuela, Alajuela",
        },
      });
      expect(created.status, JSON.stringify(created.body)).toBe(200);
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
      const { data: createdReview, error: createdReviewError } = await admin.from("reviews")
        .select("id")
        .eq("booking_id", bookingId)
        .single();
      if (createdReviewError) throw createdReviewError;
      reviewId = createdReview.id;

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
        if (reviewId) {
          const { error: reviewNotificationError } = await admin.from("notifications").delete()
            .eq("type", "review_received")
            .contains("data", { review_id: reviewId });
          expect(reviewNotificationError, "review notification cleanup").toBeNull();
        }
        const { error: reviewError } = await admin.from("reviews").delete().eq("booking_id", bookingId);
        expect(reviewError, "review lifecycle cleanup").toBeNull();
        const { error: bookingNotificationError } = await admin.from("notifications").delete().contains("data", { booking_id: bookingId });
        expect(bookingNotificationError, "review booking notification cleanup").toBeNull();
        const { error: bookingError } = await admin.from("bookings").delete().eq("id", bookingId);
        expect(bookingError, "review booking cleanup").toBeNull();
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

  test("professional profile and service edits persist through their real UI", async ({ page }) => {
    const admin = regressionAdminClient();
    const marker = `E2E profile ${Date.now()}`;
    let account: DisposableAccount | undefined;
    let releaseProfileSave: (() => void) | undefined;
    let releaseServiceSave: (() => void) | undefined;

    try {
      account = await createDisposableAccount({ prefix: "profile-service", professional: true });
      const { data: serviceFixture, error: serviceFixtureError } = await admin
        .from("professionals")
        .select("portfolio_urls")
        .eq("id", account.professionalId!)
        .single();
      if (serviceFixtureError) throw serviceFixtureError;
      const reusableImageUrl = Array.isArray(serviceFixture.portfolio_urls) ? serviceFixture.portfolio_urls[0] : null;
      expect(reusableImageUrl, "The disposable service editor needs one reusable image").toBeTruthy();
      await page.route("**/api/upload/photo", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: reusableImageUrl, publicId: "regression/reused-profile-service-fixture" }),
        });
      });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, "/es/dashboard/profesional?tab=profile&mode=offer");
      await page.getByRole("button", { name: /Datos b.sicos.*Foto, nombre y descripci/i }).click();
      const bio = page.locator('[data-field="bio"] textarea');
      await expect(bio).toBeVisible();
      await bio.fill(marker);
      const profilePhotoField = page.locator('[data-field="photo"]');
      const profilePhoto = profilePhotoField.locator('input[type="file"]');
      await profilePhoto.setInputFiles({ name: "e2e-profile.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
      await expect(profilePhotoField.locator('img[src^="blob:"]')).toBeVisible();
      const profileSaveGate = new Promise<void>((resolve) => { releaseProfileSave = resolve; });
      await page.route("**/rest/v1/professionals*", async (route) => {
        if (route.request().method() === "PATCH" && route.request().postData()?.includes(marker)) {
          await profileSaveGate;
        }
        await route.continue();
      });
      const saveProfile = page.getByTestId("profile-save-basic");
      await expect(saveProfile).toHaveCount(1);
      await saveProfile.click();
      await expect(saveProfile).toContainText(/Guardando|Saving/i);
      releaseProfileSave!();
      releaseProfileSave = undefined;
      await expect.poll(async () => (await admin.from("professionals").select("bio").eq("id", account!.professionalId!).single()).data?.bio).toBe(marker);
      await expect.poll(async () => (await admin.from("profiles").select("avatar_url").eq("id", account!.id).single()).data?.avatar_url).toBe(reusableImageUrl);
      // The bio is the first write in the profile save pipeline. Wait for the
      // complete pipeline before navigating so the browser cannot abort the
      // remaining location/contact/auth synchronization requests.
      await expect(saveProfile).toBeHidden();

      await gotoOK(page, "/es/dashboard/profesional?tab=services&mode=offer");
      const serviceCard = page.locator("section").filter({ has: page.getByRole("button", { name: /Editar informaci/i }) }).first();
      await expect(serviceCard).toHaveCount(1);
      await page.evaluate(() => {
        const spacer = document.createElement("div");
        spacer.dataset.testid = "service-editor-scroll-regression-spacer";
        spacer.style.height = "720px";
        document.body.prepend(spacer);
      });
      await serviceCard.scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      await serviceCard.getByRole("button", { name: /Editar informaci/i }).click();
      const dialog = page.getByRole("dialog").filter({ has: page.locator("textarea") });
      await expect(dialog).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
      await dialog.locator("textarea").fill(`${marker} service`);

      const save = dialog.getByTestId("service-edit-save");
      const consultPrice = dialog.getByRole("checkbox", { name: /Consultar precio|Ask for price/i });
      await consultPrice.uncheck();
      await save.click();
      const validationNotice = dialog.getByTestId("service-form-error");
      await expect(validationNotice).toBeVisible();
      await expect(validationNotice).toContainText(/precio|price/i);
      const [noticeBox, validationSaveBox] = await Promise.all([validationNotice.boundingBox(), save.boundingBox()]);
      expect(noticeBox, "The service validation notice needs visible geometry").not.toBeNull();
      expect(validationSaveBox, "The service save action needs visible geometry").not.toBeNull();
      expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(validationSaveBox!.y + 1);
      await expect(dialog.locator('input[inputmode="numeric"]').first()).toBeFocused();
      await consultPrice.check();
      await expect(validationNotice).toBeHidden();

      const month = dialog.getByRole("button", { name: /Enero|January/i }).filter({ visible: true });
      const year = dialog.getByRole("button", { name: /^2020$/i }).filter({ visible: true });
      await expect(month).toHaveCount(1);
      await expect(year).toHaveCount(1);
      await year.click();
      await expect(page.locator("[data-selectmenu-popup]")).toHaveCount(1);
      await page.getByRole("option", { name: "2024", exact: true }).click();
      await month.click();
      const monthPopup = page.locator("[data-selectmenu-popup]");
      await expect(monthPopup).toHaveCount(1);
      const popupBox = await monthPopup.boundingBox();
      const monthBox = await month.boundingBox();
      expect(popupBox, "The month popup needs visible geometry").not.toBeNull();
      expect(monthBox, "The month trigger needs visible geometry").not.toBeNull();
      expect(popupBox!.x).toBeGreaterThanOrEqual(0);
      expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
      expect(popupBox!.y).toBeGreaterThanOrEqual(0);
      expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
      expect(
        popupBox!.y + popupBox!.height <= monthBox!.y + 1 || popupBox!.y >= monthBox!.y + monthBox!.height - 1,
        "The month popup should stay attached without covering its trigger.",
      ).toBe(true);
      await page.getByRole("option", { name: /Febrero|February/i }).click();

      await dialog.locator('input[type="file"]').setInputFiles({
        name: "e2e-service.png",
        mimeType: "image/png",
        buffer: ONE_PIXEL_PNG,
      });
      const preview = dialog.locator("img").first();
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute("src", reusableImageUrl!);
      const [dialogBox, previewBox] = await Promise.all([dialog.boundingBox(), preview.boundingBox()]);
      expect(dialogBox, "The service dialog needs visible geometry").not.toBeNull();
      expect(previewBox, "The service image needs visible geometry").not.toBeNull();
      expect(previewBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
      expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1);

      const idleBox = await save.boundingBox();
      expect(idleBox, "The service save action needs visible geometry").not.toBeNull();
      const saveGate = new Promise<void>((resolve) => { releaseServiceSave = resolve; });
      await page.route("**/rest/v1/professionals*", async (route) => {
        if (route.request().method() === "PATCH" && route.request().postData()?.includes(`${marker} service`)) {
          await saveGate;
        }
        await route.continue();
      });
      await save.click();
      await expect(save).toContainText(/Guardando|Saving/i);
      const loadingBox = await save.boundingBox();
      expect(loadingBox, "The loading save action needs visible geometry").not.toBeNull();
      expect(Math.abs(loadingBox!.width - idleBox!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(loadingBox!.height - idleBox!.height)).toBeLessThanOrEqual(1);
      releaseServiceSave!();
      releaseServiceSave = undefined;
      await expect(dialog).toBeHidden();
      await expect(serviceCard).toContainText(`${marker} service`);
      await expect.poll(async () => {
        const { data } = await admin.from("professionals").select("services").eq("id", account!.professionalId!).single();
        const services = Array.isArray(data?.services) ? data.services as Array<{ description?: string }> : [];
        return services.some((service) => service.description === `${marker} service`);
      }).toBe(true);
    } finally {
      releaseProfileSave?.();
      releaseServiceSave?.();
      await cleanupDisposableAccount(account);
    }
  });

  test("success case creation accepts an uploaded image, saves the case, and restores the seed", async ({ page }) => {
    const admin = regressionAdminClient();
    const marker = `E2E success case ${Date.now()}`;
    let account: DisposableAccount | undefined;

    try {
      account = await createDisposableAccount({ prefix: "success-case", professional: true });
      const { data: before, error } = await admin.from("professionals").select("portfolio_items, portfolio_urls").eq("id", account.professionalId!).single();
      if (error) throw error;
      const reusableImageUrl = (Array.isArray(before?.portfolio_urls) ? before.portfolio_urls[0] : undefined)
        ?? (Array.isArray(before?.portfolio_items)
          ? (before.portfolio_items as Array<{ url?: string; image_url?: string; photos?: string[] }>).flatMap((item) => [item.url, item.image_url, ...(item.photos ?? [])]).find(Boolean)
          : undefined);
      expect(reusableImageUrl, "The regression fixture needs one reusable portfolio image").toBeTruthy();
      // This suite validates the complete case editor without leaking a new
      // Cloudinary asset on every CI run. Provider upload + ownership cleanup is
      // exercised separately by the disposable account-deletion regression.
      await page.route("**/api/upload/photo", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: reusableImageUrl, publicId: "regression/reused-fixture" }),
        });
      });
      await loginAs(page, account.email, account.password);
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
      await expect(dialog).toBeHidden();
      await expect(page.getByText(marker, { exact: true })).toBeVisible();
      const saveSection = page.getByRole("button", { name: /^Guardar cambios$/i }).filter({ visible: true });
      await expect(saveSection).toHaveCount(1);
      await saveSection.click();

      await expect.poll(async () => {
        const { data } = await admin.from("professionals").select("portfolio_items").eq("id", account!.professionalId!).single();
        const items = Array.isArray(data?.portfolio_items) ? data.portfolio_items as Array<{ title?: string }> : [];
        return items.some((item) => item.title === marker);
      }, { timeout: 20_000 }).toBe(true);
      await expectHealthyPage(page);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });

  test("availability privacy changes persist and can be published again", async ({ page }) => {
    const admin = regressionAdminClient();
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "availability", professional: true });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, "/es/dashboard/profesional?tab=availability&mode=offer");
      const privacy = page.getByRole("switch", { name: /Hacer (?:privada|p.blica)/i }).filter({ visible: true });
      await expect(privacy).toHaveCount(1);
      await expect(privacy).toHaveAttribute("aria-checked", "false");
      await privacy.click();
      await expect(privacy).toHaveAttribute("aria-checked", "true");
      await page.getByRole("button", { name: /Guardar cambios/i }).filter({ visible: true }).click();
      await expectVisibleText(page.locator("body"), /Ocultar tu agenda/i);
      const confirm = page.getByRole("button", { name: /S., ocultar agenda/i }).filter({ visible: true });
      await expect(confirm).toHaveCount(1);
      await confirm.click();
      await expect.poll(async () => (await admin.from("professionals").select("availability_public").eq("id", account!.professionalId!).single()).data?.availability_public).toBe(false);

      await gotoOK(page, "/es/dashboard/profesional?tab=availability&mode=offer");
      const publish = page.getByRole("switch", { name: /Hacer (?:privada|p.blica)/i }).filter({ visible: true });
      await expect(publish).toHaveCount(1);
      await expect(publish).toHaveAttribute("aria-checked", "true");
      await publish.click();
      await expect(publish).toHaveAttribute("aria-checked", "false");
      await page.getByRole("button", { name: /Guardar cambios/i }).filter({ visible: true }).click();
      await expect.poll(async () => (await admin.from("professionals").select("availability_public").eq("id", account!.professionalId!).single()).data?.availability_public).toBe(true);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });
});
