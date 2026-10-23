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
    await page.goto("/es/dashboard/profesional?tab=pro_clients");
    await page.getByRole("button",{name:"Nuevo cliente",exact:true}).click();
    await page.getByLabel("Nombre",{exact:true}).fill("Empresa ficticia GTI");
    await page.getByText("Datos del negocio (opcionales)",{exact:true}).click();
    await page.getByLabel("Cédula, DIMEX o NITE",{exact:true}).fill("9-9999-9999");
    await page.getByLabel("Nombre comercial",{exact:true}).fill("Negocio de prueba");
    await page.getByLabel("Grupo de clientes",{exact:true}).fill("Empresas");
    await page.getByLabel("Dirección",{exact:true}).fill("Dirección ficticia");
    await page.getByRole("button",{name:"Guardar",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await page.getByLabel("Buscar registros").fill("999999999");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Empresa ficticia GTI");
    const stored=await db.from("pro_workspaces").select("document").eq("user_id",actor.id).single();
    expect(stored.data?.document.clients.find((c:{name:string})=>c.name==="Empresa ficticia GTI")).toMatchObject({identification:"999999999",tradeName:"Negocio de prueba",group:"Empresas",address:"Dirección ficticia"});
    await page.goto("/en/dashboard/profesional?tab=pro_inventory");
    await page
      .getByRole("button", { name: "New product", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Initial stock");
    await page.getByText("Catalog details (optional)",{exact:true}).click();
    await page.getByLabel("Code",{exact:true}).fill("GTI-FICTICIO");
    await page.getByLabel("Product",{exact:true}).fill("Material ficticio");
    await page.getByLabel("Initial stock",{exact:true}).fill("5");
    await page.getByLabel("Minimum",{exact:true}).fill("1");
    await page.getByLabel("Unit cost ₡",{exact:true}).fill("100");
    await page.getByLabel("Unit price ₡",{exact:true}).fill("200");
    await page.getByLabel("Category",{exact:true}).fill("Materiales");
    await page.getByLabel("Unit of measure",{exact:true}).fill("m");
    await page.getByLabel("CABYS code",{exact:true}).fill("1234567890123");
    await page.getByRole("button",{name:"Save",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await page.getByLabel("Search records").fill("1234567890123");
    await expect(cards).toContainText("Material ficticio");
    await page.getByRole("button", {name:"New product",exact:true}).click();
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
