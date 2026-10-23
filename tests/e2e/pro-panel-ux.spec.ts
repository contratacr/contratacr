import { test, expect } from "playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createDisposableAccount,
  cleanupDisposableAccount,
} from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { emptyBusiness } from "../../src/lib/pro/business";
import { expectNoHorizontalOverflow } from "./helpers";
test("connected panel lists reveal next twenty, search, translate and retire social requests", async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  const actor = await createDisposableAccount({ prefix: "pro-panel-ux" });
  const db = regressionAdminClient();
  try {
    expect(
      (
        await db
          .from("professionals")
          .insert({
            profile_id: actor.id,
            category_id: "desarrollo_web",
            business_name: "Negocio ficticio",
            slug: "ux-" + actor.id,
            whatsapp: "",
            provincia_id: "al",
            canton_id: "al-at",
            verification_status: "pending",
          })
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("profiles")
          .update({ is_provider: true })
          .eq("id", actor.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("pro_memberships")
          .insert({ user_id: actor.id, status: "active" })
      ).error,
    ).toBeNull();
    const document = emptyBusiness();
    for (let i = 1; i <= 44; i++)
      document.clients.push({
        id: "c-" + i,
        name: "Cliente " + String(i).padStart(2, "0"),
        email: "",
        phone: "",
        notes: "",
        archived: false,
      });
    expect(
      (
        await db
          .from("pro_workspaces")
          .insert({ user_id: actor.id, document, revision: 1 })
      ).error,
    ).toBeNull();
    const auth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: async (cookies) => {
            await page
              .context()
              .addCookies(
                cookies.map((c) => ({
                  name: c.name,
                  value: c.value,
                  url: baseURL!,
                  sameSite: "Lax" as const,
                })),
              );
          },
        },
      },
    );
    expect(
      (
        await auth.auth.signInWithPassword({
          email: actor.email,
          password: actor.password,
        })
      ).error,
    ).toBeNull();
    await page.bringToFront();
    await page.goto("/dashboard/profesional?tab=pro_clients");
    const cards = page.locator("[data-business-panel] article");
    await expect(cards).toHaveCount(20);
    await page
      .getByRole("button", { name: "Ver más", exact: true })
      .evaluate((b) => b.scrollIntoView({ block: "end", behavior: "instant" }));
    await expect.poll(() => cards.count()).toBeGreaterThan(20);
    await page.getByLabel("Buscar registros").fill("Cliente 44");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Cliente 44");
    await page.getByRole("button", { name: /^Cliente 44/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Crear cotización");
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button',{name:'Crear cotización',exact:true}).click();
    await expect(page.getByLabel('Cliente guardado',{exact:true})).toHaveValue('c-44');
    await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
    await page.screenshot({
      path: testInfo.outputPath("customer-detail.png"),
      fullPage: true,
    });
    await page.goto("/en/dashboard/profesional?tab=pro_inventory");
    await page
      .getByRole("button", { name: "New product", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Initial stock");
    await expectNoHorizontalOverflow(page);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page
      .context()
      .addCookies([{ name: "NEXT_LOCALE", value: "es", url: baseURL! }]);
    await page.goto("/es/dashboard/profesional?tab=pro_social");
    await expect(page.getByRole("button",{name:"Solicitar difusión",exact:true})).toHaveCount(0);
    await expect(page.getByText("Destaca en nuestras redes",{exact:true})).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  } finally {
    await page.goto("about:blank");
    await cleanupDisposableAccount(actor);
  }
});
