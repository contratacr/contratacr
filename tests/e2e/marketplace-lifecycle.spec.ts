import { expect, test } from "playwright/test";
import { apiJson, expectHealthyPage, expectVisibleText, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

type IdBody = { id?: string; error?: string; ok?: boolean };

test.describe.configure({ mode: "serial" });

test.describe("@seeded offers, jobs and application lifecycle", () => {
  test.skip(!canRunSeededRegression(), "Requires prepared ContrataCR/SG test fixtures.");
  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  test("creates, renders, protects and transitions an offer and a job through the real APIs", async ({ page }) => {
    test.slow();
    const admin = regressionAdminClient();
    const stamp = Date.now();
    const offerTitle = `Oferta ciclo regression ${stamp}`;
    const jobTitle = `Empleo ciclo regression ${stamp}`;
    let offerId = "";
    let jobId = "";

    const { data: professional, error: professionalError } = await admin
      .from("professionals")
      .select("portfolio_urls,portfolio_items,services,category_id")
      .eq("id", seed.professionalId)
      .single();
    if (professionalError || !professional) throw professionalError ?? new Error("SG Solutions fixture not found");
    const portfolioItems = Array.isArray(professional.portfolio_items)
      ? professional.portfolio_items as Array<{ url?: string; image_url?: string; photos?: string[] }>
      : [];
    const imageUrl = (Array.isArray(professional.portfolio_urls) ? professional.portfolio_urls[0] : null)
      || portfolioItems.flatMap((item) => [item.url, item.image_url, ...(item.photos ?? [])]).find(Boolean);
    expect(imageUrl, "SG Solutions needs one existing image for the non-leaking offer lifecycle").toBeTruthy();
    const services = Array.isArray(professional.services) ? professional.services as Array<{ id?: string; serviceId?: string; name?: string; label?: string }> : [];
    const service = services[0] ?? {};

    try {
      await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
      const offer = await apiJson<IdBody>(page, "/api/offers", {
        method: "POST",
        body: {
          professional_id: seed.professionalId,
          service_category_id: service.id || service.serviceId || professional.category_id,
          title: offerTitle,
          description: "Oferta creada por la regresión para validar publicación, estados, permisos y vistas bilingües.",
          offer_type: "service_offer",
          service_label: service.name || service.label || "Servicio profesional",
          image_urls: [imageUrl],
          price_now: 45000,
          price_before: 60000,
          currency: "CRC",
          price_unit: "total",
          location_label: "Todo Costa Rica",
          valid_until: null,
          quantity_available: 3,
          status: "published",
        },
      });
      expect(offer.status, JSON.stringify(offer.body)).toBe(200);
      offerId = offer.body.id ?? "";
      expect(offerId).toBeTruthy();

      const job = await apiJson<IdBody>(page, "/api/jobs/posts", {
        method: "POST",
        body: {
          employer_id: seed.professionalId,
          service_category_id: professional.category_id,
          title: jobTitle,
          description: "Empleo creado por la regresión para comprobar publicación, postulación, estados y propiedad.",
          responsibilities: ["Completar el trabajo descrito", "Comunicar avances verificables"],
          requirements: ["Experiencia demostrable", "Disponibilidad para coordinación"],
          benefits: ["Horario flexible"],
          duration_label: "Proyecto de regresión",
          employment_type: "contract",
          experience_level: "any",
          workplace_type: "remote",
          location_label: null,
          salary_min: 400000,
          salary_max: 600000,
          salary_period: "monthly",
          currency: "CRC",
          show_salary: true,
          openings: 1,
          application_deadline: null,
          status: "published",
        },
      });
      expect(job.status, JSON.stringify(job.body)).toBe(200);
      jobId = job.body.id ?? "";
      expect(jobId).toBeTruthy();

      for (const locale of ["es", "en"] as const) {
        await gotoOK(page, `/${locale}/ofertas/${offerId}`);
        await expectVisibleText(page.locator("main"), offerTitle);
        await expectHealthyPage(page);
        await gotoOK(page, `/${locale}/empleos/${jobId}`);
        await expectVisibleText(page.locator("main"), jobTitle);
        await expectHealthyPage(page);
      }

      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      const foreignOffer = await apiJson<IdBody>(page, "/api/offers", { method: "PATCH", body: { id: offerId, status: "paused" } });
      const foreignJob = await apiJson<IdBody>(page, "/api/jobs/posts", { method: "PATCH", body: { id: jobId, status: "paused" } });
      expect(foreignOffer.status).toBe(403);
      expect(foreignJob.status).toBe(403);

      // ContrataCR has a seeded recent CV. Submit it through the real English UI
      // and ensure the application appears with that resume in My applications.
      await gotoOK(page, `/en/empleos/${jobId}`);
      const apply = page.getByRole("button", { name: /^Apply$/i }).filter({ visible: true });
      await expect(apply.first()).toBeVisible();
      await apply.first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();

      // The signed-out Apply action targets this URL after login. Cover the
      // destination contract independently from the normal visible CTA.
      await gotoOK(page, `/en/empleos/${jobId}?apply=${jobId}`);
      const application = page.getByRole("dialog").locator("form").filter({ has: page.getByRole("button", { name: /Submit application/i }) }).first();
      await expect(application).toBeVisible();
      await expect(application.getByText("Recently used resume", { exact: true })).toBeVisible({ timeout: 15_000 });
      await application.getByPlaceholder(/Briefly explain/i).fill("I am interested in this regression job and meet all stated requirements.");
      await application.getByRole("textbox", { name: /^Phone \*$/i }).fill("88887777");
      await application.getByRole("button", { name: /Submit application/i }).click();
      await expect(page.getByText(/Application sent/i)).toBeVisible({ timeout: 20_000 });

      await gotoOK(page, "/en/dashboard/profesional?tab=applications&mode=use");
      const applicationCard = page.locator("article").filter({ hasText: jobTitle }).first();
      await expect(applicationCard).toBeVisible();
      await applicationCard.getByRole("button").first().click();
      await expect(applicationCard.getByRole("link", { name: /Download CV/i })).toBeVisible();

      await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
      for (const status of ["paused", "sold_out", "expired", "published"] as const) {
        const result = await apiJson<IdBody>(page, "/api/offers", { method: "PATCH", body: { id: offerId, status } });
        expect(result.status, `${status}: ${JSON.stringify(result.body)}`).toBe(200);
        const { data } = await admin.from("professional_offers").select("status").eq("id", offerId).single();
        expect(data?.status).toBe(status);
      }
      for (const status of ["paused", "closed", "published"] as const) {
        const result = await apiJson<IdBody>(page, "/api/jobs/posts", { method: "PATCH", body: { id: jobId, status } });
        expect(result.status, `${status}: ${JSON.stringify(result.body)}`).toBe(200);
        const { data } = await admin.from("job_posts").select("status").eq("id", jobId).single();
        expect(data?.status).toBe(status);
      }

      await gotoOK(page, `/en/dashboard/profesional?tab=jobs&job=${jobId}`);
      await expect(page.locator("article").filter({ hasText: jobTitle }).first()).toBeVisible();
      await gotoOK(page, `/en/dashboard/profesional?tab=offers&offer=${offerId}`);
      await expect(page.locator("article").filter({ hasText: offerTitle }).first()).toBeVisible();
      await expectHealthyPage(page);
    } finally {
      if (jobId) {
        const { error: jobNotificationError } = await admin.from("notifications").delete().contains("data", { job_id: jobId });
        expect(jobNotificationError, "job lifecycle notification cleanup").toBeNull();
        const { error: jobActivityNotificationError } = await admin.from("notifications").delete().contains("data", { content_id: jobId });
        expect(jobActivityNotificationError, "job activity notification cleanup").toBeNull();
        const { error: jobActivityError } = await admin.from("professional_activity").delete()
          .eq("professional_id", seed.professionalId)
          .eq("activity_type", "job")
          .eq("content_id", jobId);
        expect(jobActivityError, "job activity cleanup").toBeNull();
        const { error: jobError } = await admin.from("job_posts").delete().eq("id", jobId).eq("employer_id", seed.professionalId);
        expect(jobError, "job lifecycle cleanup").toBeNull();
      }
      if (offerId) {
        const { error: offerNotificationError } = await admin.from("notifications").delete().contains("data", { content_id: offerId });
        expect(offerNotificationError, "offer activity notification cleanup").toBeNull();
        const { error: offerActivityError } = await admin.from("professional_activity").delete()
          .eq("professional_id", seed.professionalId)
          .eq("activity_type", "offer")
          .eq("content_id", offerId);
        expect(offerActivityError, "offer activity cleanup").toBeNull();
        const { error: offerError } = await admin.from("professional_offers").delete().eq("id", offerId).eq("professional_id", seed.professionalId);
        expect(offerError, "offer lifecycle cleanup").toBeNull();
      }
    }
  });
});
