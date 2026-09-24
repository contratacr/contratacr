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
  // Espejo de GUIDE_ITEMS en el panel. Las guías de citas, postulaciones,
  // conexiones y disponibilidad salieron con sus pantallas; dejarlas aquí hacía
  // fallar la prueba por un texto que ya nadie escribe.
  { id: "clientPanel", stepCount: 5, target: { kind: "tab", value: "sent_projects" } },
  { id: "clientProjects", stepCount: 3, target: { kind: "tab", value: "sent_projects" } },
  { id: "clientSaved", stepCount: 4, target: { kind: "tab", value: "saved" } },
  { id: "clientProfile", stepCount: 3, target: { kind: "tab", value: "profile" } },
  { id: "searchServices", stepCount: 5, target: { kind: "path", value: "/buscar" } },
  { id: "jobsGuide", stepCount: 4, target: { kind: "path", value: "/empleos" } },
  { id: "offersGuide", stepCount: 4, target: { kind: "path", value: "/promociones" } },
  { id: "notificationsGuide", stepCount: 5, target: { kind: "tab", value: "notifications" } },
  { id: "reviewsGuide", stepCount: 4, target: { kind: "path", value: "/buscar" } },
  { id: "supportGuide", stepCount: 3, target: { kind: "tab", value: "soporte" } },
  { id: "accountSecurityGuide", stepCount: 4, target: { kind: "tab", value: "cuenta" } },
  { id: "professionalPanel", stepCount: 4, target: { kind: "tab", value: "publicaciones" } },
  { id: "completionGuide", stepCount: 4, target: { kind: "tab", value: "completion" } },
  { id: "opportunities", stepCount: 3, target: { kind: "path", value: "/proyectos" } },
  { id: "successCases", stepCount: 4, target: { kind: "tab", value: "profile" } },
  { id: "services", stepCount: 4, target: { kind: "tab", value: "profile" } },
  { id: "jobsPanel", stepCount: 4, target: { kind: "tab", value: "publicaciones" } },
  { id: "offersPanel", stepCount: 4, target: { kind: "tab", value: "publicaciones" } },
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
  return title;
}

async function openGuides(page: Page, locale: Locale) {
  const buttonName = locale === "en" ? "Guides" : "Guías";
  const openButton = page.getByRole("button", { name: buttonName, exact: true }).filter({ visible: true }).first();
  await expect(openButton).toBeVisible({ timeout: 30_000 });
  await openButton.click();
  // Guías es una ventana sobre el panel, no una sección con dirección propia.
  const ventana = page.getByRole("dialog").filter({ visible: true }).first();
  await expect(ventana).toBeVisible();
  return ventana;
}

// Se siembran SOLO tipos que el app genera hoy —proyecto nuevo, resena recibida
// y respuesta de soporte—. Seguir, postularse y las citas salieron del producto
// y sus avisos ya no se traducen: sembrarlos probaba una pantalla que no existe.
async function seedNotifications(userId: string, locale: Locale) {
  const admin = regressionAdminClient();
  const runId = `notification-ui-${locale}-${randomUUID()}`;
  const projectTitle = `Project ${runId}`;
  const reviewerName = `Reviewer ${runId}`;
  const ticketSubject = `Ticket ${runId}`;
  const rows = [
    {
      user_id: userId,
      type: "new_project",
      title: "Nuevo proyecto",
      message: `Un cliente publicó "${projectTitle}" en Desarrollo web.`,
      data: { regression_run: runId, push_suppressed: true, link: "/es/proyectos", project_title: projectTitle, category_id: "desarrollo_web" },
      read: false,
    },
    {
      user_id: userId,
      type: "review_received",
      title: "Nueva reseña recibida",
      message: `${reviewerName} te dejó una reseña de 5 estrellas.`,
      data: { regression_run: runId, push_suppressed: true, client_name: reviewerName, rating: 5 },
      read: false,
    },
    {
      user_id: userId,
      type: "support_reply",
      title: "Respuesta de soporte",
      message: `Soporte respondió a tu ticket "${ticketSubject}".`,
      data: { regression_run: runId, push_suppressed: true, ticket_subject: ticketSubject },
      read: false,
    },
  ];
  const { data, error } = await admin.from("notifications").insert(rows).select("id,type");
  if (error || !data || data.length !== rows.length) throw error ?? new Error("Could not seed notification UI rows");
  return {
    runId,
    projectTitle,
    reviewerName,
    ticketSubject,
    ids: data.map((row) => String(row.id)),
    projectId: String(data.find((row) => row.type === "new_project")?.id ?? ""),
    reviewId: String(data.find((row) => row.type === "review_received")?.id ?? ""),
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
            supportMessage: `Support replied to your ticket "${seeded.ticketSubject}".`,
            globalOptions: "Notification options",
            markAll: "Mark all read",
            rowOptions: "Options",
            deleteOne: "Delete",
            deleteAll: "Delete all",
            empty: "You have no notifications.",
          }
        : {
            heading: "Notificaciones",
            supportMessage: `Soporte respondió a tu ticket "${seeded.ticketSubject}".`,
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
        // En el teléfono el nombre de la pantalla lo pone la barra de arriba
        // —menú, marca y «Notificaciones», como en Ofertas—; en computadora
        // sigue siendo el título de la propia lista.
        await expect(
          list.getByRole("heading", { name: copy.heading, exact: true })
            .or(page.getByRole("banner").getByText(copy.heading, { exact: true }))
            .filter({ visible: true })
            .first(),
        ).toBeVisible();
        await expect(list.getByText(copy.supportMessage, { exact: false }).first()).toBeVisible();
        await expect(list.getByText(seeded.projectTitle, { exact: false })).toBeVisible();

        // Abrir «nuevo proyecto» lleva al tablero de proyectos y deja el aviso leido.
        const projectRow = list.locator(".ccr-notifications-items > li").filter({ hasText: seeded.projectTitle });
        await projectRow.locator("div[role='button']").first().click();
        await page.waitForURL(new RegExp(`/${locale}/proyectos`), { waitUntil: "domcontentloaded" });
        await expect.poll(async () => {
          const rows = await notificationRows([seeded.projectId]);
          return rows[0]?.read;
        }, { message: "Opening a notification should persist its read state" }).toBe(true);

        await gotoOK(page, `/${locale}/notificaciones`);
        // El «...» general ya no vive en la cabecera de la lista: se movió a la
        // misma fila que «Nuevas», el primer rótulo, para que no quedara suelto
        // a otra altura. Se busca dentro de la lista, no en una fila concreta.
        await list.getByRole("button", { name: copy.globalOptions, exact: true }).first().click();
        await page.getByRole("menuitem", { name: copy.markAll, exact: true }).click();
        await expect.poll(async () => {
          const rows = await notificationRows(seeded.ids);
          return rows.length === seeded.ids.length && rows.every((row) => row.read);
        }, { message: "Mark all read should persist for every seeded notification" }).toBe(true);
        // Ya no hay pastilla de «Todo al día»: una etiqueta que solo aparece
        // cuando no pasa nada no informaba, y el propio vacío ya lo dice. Lo que
        // se comprueba es que ninguna fila quede marcada como sin leer.
        await expect(list.locator(".ccr-notifications-items > li [data-unread='true']")).toHaveCount(0);

        const applicationRow = list.locator(".ccr-notifications-items > li").filter({ hasText: seeded.reviewerName });
        // The row menu lives inside the row on the web and in a portal inside
        // the native shell, so locate its item by role wherever it renders.
        await applicationRow.getByRole("button", { name: copy.rowOptions, exact: true }).click();
        const deleteOne = page.getByRole("menuitem", { name: copy.deleteOne, exact: true }).filter({ visible: true }).first();
        await expect(deleteOne).toBeVisible();
        await deleteOne.click();
        await expect.poll(async () => (await notificationRows([seeded.reviewId])).length, {
          message: "Deleting one notification should remove only that row",
        }).toBe(0);
        await expect(applicationRow).toHaveCount(0);

        await list.getByRole("button", { name: copy.globalOptions, exact: true }).first().click();
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
        const guideButton = dialog
          .getByRole("button")
          .filter({ has: page.getByText(guideButtonName(copy.title), { exact: true }) })
          .filter({ visible: true })
          .first();
        await guideButton.click();
        const expandedRow = guideButton.locator("..");
        await expect(expandedRow.getByText(copy.body, { exact: true })).toBeVisible();
        await expect(expandedRow.getByRole("listitem")).toHaveCount(guide.stepCount);
        for (const step of copy.steps) {
          await expect(expandedRow.getByText(step, { exact: true })).toBeVisible();
        }
        await expect(expandedRow.getByRole("button", { name: copy.cta, exact: true }).last()).toBeVisible();
      }

      await expectNoHorizontalOverflow(page);
      await expectNoRawI18nKeys(page);
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
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
            "clientProjects",
            "searchServices",
            "notificationsGuide",
            "offersGuide",
            "professionalProfile",
          ].includes(guide.id));
      for (const guide of guides) {
        // On compact layouts Guides is intentionally available from the panel
        // home, while focused sections render only their own back navigation.
        await gotoOK(page, `/${locale}/dashboard/profesional?tab=home`);
        const seccion = await openGuides(page, locale);
        const copy = messages.items[guide.id];
        await seccion
          .getByRole("button")
          .filter({ has: page.getByText(guideButtonName(copy.title), { exact: true }) })
          .filter({ visible: true })
          .first()
          .click();
        await seccion.getByRole("button", { name: copy.cta, exact: true }).last().click();

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
      }

      await gotoOK(page, `/${locale}/dashboard/profesional?tab=home`);
      const seccionSoporte = await openGuides(page, locale);
      await seccionSoporte.getByRole("button", { name: messages.supportCta, exact: true }).click();
      await page.waitForURL((url) => url.pathname === `/${locale}/dashboard/profesional` && url.searchParams.get("tab") === "soporte", { waitUntil: "domcontentloaded" });
      await expectNoRawI18nKeys(page);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
    }
  });
});
