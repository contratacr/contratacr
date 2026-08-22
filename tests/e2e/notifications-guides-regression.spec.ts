import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";
import esMessages from "../../messages/es.json";
import enMessages from "../../messages/en.json";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { expectNoHorizontalOverflow, expectNoRawI18nKeys, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, ensureRegressionSeed, regressionAdminClient } from "./seed";

type Locale = "es" | "en";

type GuideExpectation = {
  id: string;
  stepCount: number;
  target: { kind: "tab"; value: string } | { kind: "path"; value: string };
};

const GUIDE_EXPECTATIONS: GuideExpectation[] = [
  { id: "clientPanel", stepCount: 5, target: { kind: "tab", value: "sent_bookings" } },
  { id: "clientRequests", stepCount: 3, target: { kind: "tab", value: "sent_bookings" } },
  { id: "clientProjects", stepCount: 3, target: { kind: "tab", value: "sent_projects" } },
  { id: "clientApplications", stepCount: 4, target: { kind: "tab", value: "applications" } },
  { id: "clientSaved", stepCount: 4, target: { kind: "tab", value: "saved" } },
  { id: "clientConnections", stepCount: 3, target: { kind: "tab", value: "connections" } },
  { id: "clientProfile", stepCount: 3, target: { kind: "tab", value: "profile" } },
  { id: "searchServices", stepCount: 5, target: { kind: "path", value: "/buscar" } },
  { id: "jobsGuide", stepCount: 4, target: { kind: "path", value: "/empleos" } },
  { id: "offersGuide", stepCount: 4, target: { kind: "path", value: "/ofertas" } },
  { id: "followingGuide", stepCount: 4, target: { kind: "tab", value: "network" } },
  { id: "notificationsGuide", stepCount: 5, target: { kind: "tab", value: "notifications" } },
  { id: "reviewsGuide", stepCount: 4, target: { kind: "path", value: "/buscar" } },
  { id: "supportGuide", stepCount: 3, target: { kind: "tab", value: "soporte" } },
  { id: "accountSecurityGuide", stepCount: 4, target: { kind: "tab", value: "cuenta" } },
  { id: "professionalPanel", stepCount: 4, target: { kind: "tab", value: "bookings" } },
  { id: "completionGuide", stepCount: 4, target: { kind: "tab", value: "completion" } },
  { id: "requests", stepCount: 3, target: { kind: "tab", value: "bookings" } },
  { id: "opportunities", stepCount: 3, target: { kind: "tab", value: "proposals" } },
  { id: "successCases", stepCount: 4, target: { kind: "tab", value: "photos" } },
  { id: "availability", stepCount: 4, target: { kind: "tab", value: "availability" } },
  { id: "services", stepCount: 4, target: { kind: "tab", value: "services" } },
  { id: "jobsPanel", stepCount: 4, target: { kind: "tab", value: "jobs" } },
  { id: "offersPanel", stepCount: 4, target: { kind: "tab", value: "offers" } },
  { id: "professionalProfile", stepCount: 5, target: { kind: "tab", value: "profile" } },
];

type GuideCopy = { title: string; body: string; steps: string[]; cta: string };
type GuideMessages = {
  modalTitle: string;
  supportCta: string;
  sections: { client: string; professional: string; shared: string };
  items: Record<string, GuideCopy>;
};

function guideMessages(locale: Locale): GuideMessages {
  return (locale === "en" ? enMessages : esMessages).proPanel.guides as GuideMessages;
}

function guideButtonName(title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}$`);
}

async function openGuides(page: Page, locale: Locale) {
  const messages = guideMessages(locale);
  const buttonName = locale === "en" ? "Guides" : "Guías";
  const openButton = page.getByRole("button", { name: buttonName, exact: true }).filter({ visible: true }).first();
  await expect(openButton).toBeVisible({ timeout: 30_000 });
  await openButton.click();
  const dialog = page.getByRole("dialog").filter({ hasText: messages.modalTitle }).first();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function seedNotifications(userId: string, locale: Locale) {
  const admin = regressionAdminClient();
  const runId = `notification-ui-${locale}-${randomUUID()}`;
  const followerName = `Follower ${runId}`;
  const applicantName = `Applicant ${runId}`;
  const jobTitle = `Job ${runId}`;
  const professionalName = `Professional ${runId}`;
  const serviceName = `Service ${runId}`;
  const rows = [
    {
      user_id: userId,
      type: "professional_follow",
      title: `Follow ${runId}`,
      message: `Follow message ${runId}`,
      data: { regression_run: runId, push_suppressed: true, follower_name: followerName },
      read: false,
    },
    {
      user_id: userId,
      type: "job_application",
      title: `Application ${runId}`,
      message: `Application message ${runId}`,
      data: { regression_run: runId, push_suppressed: true, applicant_name: applicantName, job_title: jobTitle },
      read: false,
    },
    {
      user_id: userId,
      type: "booking_confirmed",
      title: "Solicitud confirmada",
      message: `${professionalName} confirmó tu solicitud de '${serviceName}'.`,
      data: {
        regression_run: runId,
        push_suppressed: true,
        professional_name: professionalName,
        service_description: serviceName,
        booking_status: "confirmed",
      },
      read: false,
    },
  ];
  const { data, error } = await admin.from("notifications").insert(rows).select("id,type");
  if (error || !data || data.length !== rows.length) throw error ?? new Error("Could not seed notification UI rows");
  return {
    runId,
    followerName,
    applicantName,
    professionalName,
    serviceName,
    ids: data.map((row) => String(row.id)),
    followerId: String(data.find((row) => row.type === "professional_follow")?.id ?? ""),
    applicationId: String(data.find((row) => row.type === "job_application")?.id ?? ""),
  };
}

async function cleanupNotifications(userId: string, runId: string) {
  const { error } = await regressionAdminClient()
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .contains("data", { regression_run: runId });
  if (error) throw error;
}

async function notificationRows(ids: string[]) {
  const { data, error } = await regressionAdminClient()
    .from("notifications")
    .select("id,read")
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

test.describe.configure({ mode: "serial" });

test.describe("@notifications-guides disposable bilingual UI regression", () => {
  test.skip(!canRunSeededRegression(), "Requires prepared test fixtures and the test Supabase service role.");

  let account: DisposableAccount;

  test.beforeAll(async () => {
    await ensureRegressionSeed();
    account = await createDisposableAccount({ prefix: "notifications-guides", professional: true });
    const admin = regressionAdminClient();
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(account.id);
    if (authUserError || !authUser.user) throw authUserError ?? new Error("Disposable guide account was not created");
    const { error: metadataError } = await admin.auth.admin.updateUserById(account.id, {
      user_metadata: {
        ...authUser.user.user_metadata,
        role: "professional",
        is_provider: true,
        onboarding_completed: true,
      },
    });
    if (metadataError) throw metadataError;
  });

  test.afterAll(async () => {
    await cleanupDisposableAccount(account);
  });

  for (const locale of ["es", "en"] as const) {
    test(`notifications support read, navigation and deletion in ${locale}`, async ({ page }) => {
      test.slow();
      const seeded = await seedNotifications(account.id, locale);
      const copy = locale === "en"
        ? {
            heading: "Notifications",
            unread: "3 unread",
            followTitle: "New follower",
            applicationTitle: "New application",
            bookingTitle: "Request confirmed",
            bookingMessage: `${seeded.professionalName} confirmed your request for '${seeded.serviceName}'.`,
            globalOptions: "Notification options",
            markAll: "Mark all read",
            rowOptions: "Notification options",
            deleteOne: "Delete",
            deleteAll: "Delete all",
            empty: "You have no notifications.",
          }
        : {
            heading: "Notificaciones",
            unread: "3 sin leer",
            followTitle: "Nuevo seguidor",
            applicationTitle: "Nueva postulación",
            bookingTitle: "Solicitud confirmada",
            bookingMessage: `${seeded.professionalName} confirmó tu solicitud de '${seeded.serviceName}'.`,
            globalOptions: "Opciones de notificaciones",
            markAll: "Marcar todas como leídas",
            rowOptions: "Opciones",
            deleteOne: "Eliminar",
            deleteAll: "Eliminar todas",
            empty: "No tienes notificaciones.",
          };

      try {
        await loginAs(page, account.email, account.password);
        await gotoOK(page, `/${locale}/notificaciones`);
        const list = page.locator(".ccr-notifications-list");
        await expect(list.getByRole("heading", { name: copy.heading, exact: true })).toBeVisible();
        await expect(list.getByText(copy.unread, { exact: true })).toBeVisible();
        await expect(list.getByText(copy.followTitle, { exact: true })).toBeVisible();
        await expect(list.getByText(copy.applicationTitle, { exact: true })).toBeVisible();
        await expect(list.getByText(copy.bookingTitle, { exact: true })).toBeVisible();
        await expect(list.getByText(copy.bookingMessage, { exact: true })).toBeVisible();
        await expect(list.getByText(seeded.followerName, { exact: false })).toBeVisible();

        const followerRow = list.locator(".ccr-notifications-items > li").filter({ hasText: seeded.followerName });
        await followerRow.locator(":scope > div[role='button']").click();
        await page.waitForURL(new RegExp(`/${locale}/dashboard/profesional\\?.*tab=network`), { waitUntil: "domcontentloaded" });
        await expect.poll(async () => {
          const rows = await notificationRows([seeded.followerId]);
          return rows[0]?.read;
        }, { message: "Opening a notification should persist its read state" }).toBe(true);

        await gotoOK(page, `/${locale}/notificaciones`);
        await expect(list.getByText(locale === "en" ? "2 unread" : "2 sin leer", { exact: true })).toBeVisible();
        const header = list.locator(".ccr-notifications-list-header");
        await header.getByRole("button", { name: copy.globalOptions, exact: true }).click();
        await page.getByRole("menuitem", { name: copy.markAll, exact: true }).click();
        await expect.poll(async () => {
          const rows = await notificationRows(seeded.ids);
          return rows.length === seeded.ids.length && rows.every((row) => row.read);
        }, { message: "Mark all read should persist for every seeded notification" }).toBe(true);
        // With nothing left unread the header reads "Todo al día" / "All caught up".
        await expect(list.getByText(locale === "en" ? "All caught up" : "Todo al día", { exact: true })).toBeVisible();

        const applicationRow = list.locator(".ccr-notifications-items > li").filter({ hasText: seeded.applicantName });
        // The row menu lives inside the row on the web and in a portal inside
        // the native shell, so locate its item by role wherever it renders.
        await applicationRow.getByRole("button", { name: copy.rowOptions, exact: true }).click();
        const deleteOne = page.getByRole("menuitem", { name: copy.deleteOne, exact: true }).filter({ visible: true }).first();
        await expect(deleteOne).toBeVisible();
        await deleteOne.click();
        await expect.poll(async () => (await notificationRows([seeded.applicationId])).length, {
          message: "Deleting one notification should remove only that row",
        }).toBe(0);
        await expect(applicationRow).toHaveCount(0);

        await header.getByRole("button", { name: copy.globalOptions, exact: true }).click();
        await page.getByRole("menuitem", { name: copy.deleteAll, exact: true }).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toBeVisible();
        await confirm.getByRole("button", { name: copy.deleteAll, exact: true }).click();
        await expect.poll(async () => (await notificationRows(seeded.ids)).length, {
          message: "Delete all should remove the remaining disposable notifications",
        }).toBe(0);
        await expect(list.getByText(copy.empty, { exact: true })).toBeVisible();
        await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
        await expectNoHorizontalOverflow(page);
      } finally {
        await cleanupNotifications(account.id, seeded.runId);
      }
    });
  }

  test("every guide expands with its complete steps in Spanish and English", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page, account.email, account.password);

    for (const locale of ["es", "en"] as const) {
      const messages = guideMessages(locale);
      await gotoOK(page, `/${locale}/dashboard/profesional?tab=home`);
      const dialog = await openGuides(page, locale);
      for (const section of Object.values(messages.sections)) {
        await expect(dialog.getByText(section, { exact: true })).toBeVisible();
      }

      for (const guide of GUIDE_EXPECTATIONS) {
        const copy = messages.items[guide.id];
        expect(copy, `Missing ${locale} guide copy for ${guide.id}`).toBeTruthy();
        expect(copy.steps, `${guide.id} should expose every documented step`).toHaveLength(guide.stepCount);
        const guideButton = dialog.getByRole("button", { name: guideButtonName(copy.title) }).first();
        await guideButton.click();
        const expandedRow = guideButton.locator("..");
        await expect(expandedRow.getByText(copy.body, { exact: true })).toBeVisible();
        await expect(expandedRow.getByRole("listitem")).toHaveCount(guide.stepCount);
        for (const step of copy.steps) {
          await expect(expandedRow.getByText(step, { exact: true })).toBeVisible();
        }
        await expect(expandedRow.getByRole("button", { name: copy.cta, exact: true })).toBeVisible();
      }

      await expectNoHorizontalOverflow(page);
      await expectNoRawI18nKeys(page);
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });

  test("every guide CTA and representative English links reach the documented destination", async ({ page }) => {
    test.setTimeout(360_000);
    await loginAs(page, account.email, account.password);

    for (const locale of ["es", "en"] as const) {
      const messages = guideMessages(locale);
      // CTA behavior is shared across locales, so exercise every destination once
      // in Spanish and a representative public/panel set again in English. This
      // avoids dozens of redundant full reloads that can overwhelm the dev server.
      const guides = locale === "es"
        ? GUIDE_EXPECTATIONS
        : GUIDE_EXPECTATIONS.filter((guide) => [
            "clientRequests",
            "searchServices",
            "notificationsGuide",
            "offersGuide",
            "professionalProfile",
          ].includes(guide.id));
      for (const guide of guides) {
        // On compact layouts Guides is intentionally available from the panel
        // home, while focused sections render only their own back navigation.
        await gotoOK(page, `/${locale}/dashboard/profesional?tab=home`);
        const dialog = await openGuides(page, locale);
        const copy = messages.items[guide.id];
        await dialog.getByRole("button", { name: guideButtonName(copy.title) }).first().click();
        await dialog.getByRole("button", { name: copy.cta, exact: true }).click();

        await expect
          .poll(() => {
            const url = new URL(page.url());
            return guide.target.kind === "path"
              ? url.pathname === `/${locale}${guide.target.value}`
              : url.pathname === `/${locale}/dashboard/profesional` && url.searchParams.get("tab") === guide.target.value;
          }, {
            message: `Guide "${guide.id}" should open its documented ${locale} destination`,
            timeout: 30_000,
          })
          .toBe(true);
        await expect(page.getByRole("dialog").filter({ hasText: messages.modalTitle })).toHaveCount(0);
      }

      await gotoOK(page, `/${locale}/dashboard/profesional?tab=home`);
      const dialog = await openGuides(page, locale);
      await dialog.getByRole("button", { name: messages.supportCta, exact: true }).click();
      await page.waitForURL((url) => url.pathname === `/${locale}/dashboard/profesional` && url.searchParams.get("tab") === "soporte", { waitUntil: "domcontentloaded" });
      await expectNoRawI18nKeys(page);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
    }
  });
});
