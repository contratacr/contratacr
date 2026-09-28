import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://localhost:9222");
const ctx = b.contexts()[0];
const p = ctx.pages().find((x) => x.url().includes("appstoreconnect")) ?? ctx.pages()[0];
await p.bringToFront();
await p.goto("https://appstoreconnect.apple.com/apps/6794559661/distribution/ios/version/inflight", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(9000);
await p.locator('input[type=file]').last().setInputFiles("/tmp/video-apple.mp4");
for (let i = 0; i < 28; i++) {
  await p.waitForTimeout(4000);
  const t = await p.evaluate(() => document.body.innerText);
  const j = t.indexOf("Attachment");
  const trozo = t.slice(j, j + 170).replace(/\s+/g, " ");
  if (/isn’t supported|too large|error/i.test(trozo)) { console.log("RECHAZADO:", trozo); break; }
  if (/video-apple|\.mp4|Remove|Replace|Delete/i.test(trozo)) { console.log("SUBIDO:", trozo); break; }
  if (i % 4 === 0) console.log("...", trozo.slice(0, 80));
}
await b.close();
