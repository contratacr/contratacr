import { expect, test } from "playwright/test";
import { build } from "esbuild";

// Exercise file bytes and native plugin hand-off without touching real users.
for (const platform of ["android", "ios"] as const) {
  test(`generated PDF uses ${platform} file saving instead of blob navigation`, async ({ page }) => {
    const bundled = await build({
      entryPoints: ["src/lib/file-download.ts"], bundle: true, write: false,
      platform: "browser", format: "iife", globalName: "FileDownload", tsconfig: "tsconfig.json",
      plugins: [{ name: "native-file-bridge", setup(builder) {
        builder.onResolve({ filter: /^@capacitor\/(core|filesystem|share)$/ }, (args) => ({ path: args.path, namespace: "native-mock" }));
        builder.onLoad({ filter: /.*/, namespace: "native-mock" }, (args) => ({ contents: args.path.endsWith("core")
          ? `export const Capacitor={getPlatform:()=>${JSON.stringify(platform)},isNativePlatform:()=>true,isPluginAvailable:()=>!window.__missingPlugins};`
          : args.path.endsWith("filesystem")
            ? `export const Directory={Cache:'CACHE',Documents:'DOCUMENTS'}; export const Filesystem={writeFile:async o=>{window.__saved=o;return {uri:'file:///cache/'+o.path}},deleteFile:async()=>{}};`
            : `export const Share={share:async o=>{window.__shared=o}};` }));
      } }],
    });
    await page.route("**/file-download-harness", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>PDF native regression</title>" }));
    await page.goto("/file-download-harness");
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    let downloads = 0;
    page.on("download", () => downloads++);
    const result = await page.evaluate(async () => {
      const w = window as unknown as {
        FileDownload: { saveFile: (blob: Blob, name: string) => Promise<void> };
        __saved: { data: string; path: string; directory: string };
        __shared: { files: string[] };
      };
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
      await w.FileDownload.saveFile(new Blob(["%PDF-1.7\nregression"], { type: "application/pdf" }), "Cotizacion-prueba.pdf");
      return { saved: w.__saved, shared: w.__shared };
    });
    expect(atob(result.saved.data)).toBe("%PDF-1.7\nregression");
    if (platform === "android") {
      expect(result.saved.path).toMatch(/^ContrataCR\/[^/]+\/Cotizacion-prueba\.pdf$/);
      expect(result.saved.directory).toBe("DOCUMENTS");
      expect(result.shared).toBeUndefined();
    } else {
      expect(result.saved.path).toMatch(/^file-downloads\/[^/]+\/Cotizacion-prueba\.pdf$/);
      expect(result.saved.directory).toBe("CACHE");
      expect(result.shared.files).toEqual([`file:///cache/${result.saved.path}`]);
    }
    expect(downloads).toBe(0);
    expect(page.context().pages()).toHaveLength(1);

    // An old build without the file plugins must report the missing capability,
    // never silently try an unsupported blob navigation inside the app.
    const failure = await page.evaluate(async () => {
      const w = window as unknown as { __missingPlugins: boolean; FileDownload: { saveFile: (blob: Blob, name: string) => Promise<void> } };
      w.__missingPlugins = true;
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      try { await w.FileDownload.saveFile(new Blob(["%PDF-test"]), "prueba.pdf"); return null; }
      catch (error) { return (error as Error).message; }
    });
    expect(failure).toBe("native-update-required");
    expect(downloads).toBe(0);
  });
}
