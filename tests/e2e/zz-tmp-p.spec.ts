import { test } from "playwright/test";
import { loginAs } from "./helpers";
test("pie en el panel y en sus secciones", async ({ page }, info) => {
  test.setTimeout(300_000);
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  for (const tab of ["", "?tab=sent_projects", "?tab=jobs", "?tab=offers", "?tab=quotes", "?tab=photos", "?tab=services", "?tab=profile", "?tab=saved", "?tab=soporte", "?tab=guides", "?tab=notifications"]) {
    await page.goto(`/es/dashboard/profesional${tab}`); await page.waitForTimeout(2600);
    await page.evaluate(() => { window.scrollTo(0, 999999); document.querySelectorAll<HTMLElement>("*").forEach((n) => { if (n.scrollHeight > n.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(n).overflowY)) n.scrollTop = 999999; }); });
    await page.waitForTimeout(600);
    console.log((tab || "(raíz)").padEnd(20), JSON.stringify(await page.evaluate(() => {
      const pie = document.querySelector<HTMLElement>("footer, .ccr-app-footer, .ccr-dashboard-footer");
      if (!pie) return "sin pie en el árbol";
      const c = getComputedStyle(pie); const b = pie.getBoundingClientRect();
      return { display: c.display, alto: Math.round(b.height), visibleEnPantalla: b.top < window.innerHeight && b.bottom > 0 };
    })));
  }
});
