import { test, expect } from "playwright/test";
import { build } from "esbuild";

for (const outcome of ["verified", "pending"] as const) {
  test("identity save keeps the new ID visible while parent refresh is delayed: " + outcome, async ({ page }) => {
    const bundle = await build({
      stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
        import React,{useState} from 'react';import{createRoot}from'react-dom/client';
        import{VerificationPanel}from'./src/components/dashboard/pro/verification-panel';
        function Harness(){const[updated,setUpdated]=useState(false);const[revoked,setRevoked]=useState(false);window.confirmRefresh=()=>setUpdated(true);window.revoke=()=>setRevoked(true);
          return <VerificationPanel professionalId="fixture" status={revoked ? 'pending' : updated ? window.testOutcome:'verified'}
            currentCedula={updated ? '208000002':'108000001'} currentFullName={updated ? 'NOMBRE OFICIAL COMPLETO':'NOMBRE ANTERIOR'}
            onSaved={()=>{window.framesAfterSave=[];function record(){window.framesAfterSave.push(document.querySelector('[data-current-identification]')?.textContent??'missing');if(window.framesAfterSave.length<12)requestAnimationFrame(record)}requestAnimationFrame(record)}}/>}
        createRoot(document.getElementById('root')).render(<Harness/>);
      ` },
      jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "verification-boundaries", setup(builder) {
        builder.onResolve({ filter: /^(next-intl|\.\/verification-documents|@\/components\/ui\/cedula-input|@\/components\/ui\/identity-info-block|@\/components\/professionals\/responsive-verified-name)$/ }, args => ({ path: args.path, namespace: "boundary" }));
        builder.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ resolveDir: process.cwd(), loader: "tsx", contents:
          args.path === "next-intl" ? "const translate=key=>key;export const useTranslations=()=>translate;" :
          args.path === "./verification-documents" ? "export const verificationActionButtonClass='';export const VerificationDocuments=()=> <div>Review documents</div>;" :
          args.path.endsWith("cedula-input") ? "export const CedulaInput=({value,onChange})=><input aria-label='Identification' value={value} onChange={e=>onChange(e.target.value)}/>;" :
          args.path.endsWith("identity-info-block") ? "export const IdentityInfoBlock=({fullName})=><div>{fullName}</div>;" :
          "export const ResponsiveVerifiedName=({name,verified})=><span data-verified={verified}>{name}</span>;"
        }));
      } }],
    });
    await page.route("**/verification-save-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' }));
    await page.route("**/api/cedula-available?*", route => route.fulfill({ json: { taken: false } }));
    await page.route("**/api/cedula/208000002", route => route.fulfill({ json: { found: true, fullName: "NOMBRE OFICIAL COMPLETO" } }));
    await page.route("**/api/add-cedula", route => route.fulfill({ json: { outcome, ...(outcome === "verified" ? { cedula: "208000002", fullName: "NOMBRE OFICIAL COMPLETO" } : {}) } }));
    await page.goto("/verification-save-harness");
    await page.evaluate(value => { (window as unknown as { testOutcome: string }).testOutcome = value; }, outcome);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("button", { name: "changeId", exact: true }).click();
    await page.getByLabel("Identification").fill("208000002");
    await page.getByRole("button", { name: "addCedula", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { framesAfterSave?: string[] }).framesAfterSave?.length === 12);
    const frames = await page.evaluate(() => (window as unknown as { framesAfterSave: string[] }).framesAfterSave);
    expect(frames.every(text => text.includes("208000002") && !text.includes("108000001"))).toBe(true);
    const current = page.locator("[data-current-identification]");
    await expect(current.locator("[data-verified]")).toHaveAttribute("data-verified", String(outcome === "verified"));
    if (outcome === "verified") await expect(current).toContainText("NOMBRE OFICIAL COMPLETO");
    await expect(page.getByLabel("Identification")).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { confirmRefresh: () => void }).confirmRefresh());
    await expect(current).toContainText("208000002");
    await expect(current.locator("[data-verified]")).toHaveAttribute("data-verified", String(outcome === "verified"));
    // The local acknowledgement must release once refreshed, so later admin changes remain live.
    await page.evaluate(() => (window as unknown as { revoke: () => void }).revoke());
    await expect(current.locator("[data-verified]")).toHaveAttribute("data-verified", "false");
  });
}
