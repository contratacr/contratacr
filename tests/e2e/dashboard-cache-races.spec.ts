import { test, expect } from "playwright/test";
import { clearDashboardCache, getDashboardCache, loadDashboardCache, setDashboardCache } from "../../src/lib/dashboard-prefetch-cache";

test("a late refresh cannot undo a privacy edit", async () => {
  clearDashboardCache();
  let reply!: (value: boolean) => void;
  const pending = loadDashboardCache("privacy:disposable", () => new Promise<boolean>((resolve) => { reply = resolve; }));
  setDashboardCache("privacy:disposable", false);
  reply(true); await pending;
  expect(getDashboardCache("privacy:disposable")).toBe(false);
  clearDashboardCache();
});

test("the latest request wins and sign-out discards in-flight cached data", async () => {
  clearDashboardCache();
  let oldReply!: (value: string[]) => void;
  const old = loadDashboardCache("disposable", () => new Promise<string[]>((resolve) => { oldReply = resolve; }));
  await loadDashboardCache("disposable", async () => ["new"], { force: true });
  oldReply(["old"]); await old;
  expect(getDashboardCache("disposable")).toEqual(["new"]);
  let afterSignOut!: (value: string[]) => void;
  const pending = loadDashboardCache("disposable", () => new Promise<string[]>((resolve) => { afterSignOut = resolve; }), { force: true });
  clearDashboardCache(); afterSignOut(["private"]); await pending;
  expect(getDashboardCache("disposable")).toBeNull();
});
