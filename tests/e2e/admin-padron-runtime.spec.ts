import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const requireNode = createRequire(`${process.cwd()}/tests/e2e/admin-padron-runtime.spec.ts`);
function route(options: { admin?: boolean; limited?: boolean; result?: object; fail?: boolean } = {}) {
  const lookedUp: string[] = [];
  let limits = 0;
  const mocks: Record<string, unknown> = {
    "@/lib/auth/admin": { getApiAdmin: async () => options.admin === false ? null : { id: "admin" } },
    "@/lib/rate-limit": { enforceRateLimit: () => { limits++; return options.limited ? new Response(JSON.stringify({ error: "Limit reached" }), { status: 429 }) : null; } },
    "@/lib/verification/identity-verifier": { getIdentityVerifier: () => ({ lookup: async (cedula: string) => {
      lookedUp.push(cedula);
      if (options.fail) throw new Error("private provider details");
      return options.result ?? { found: true, fullName: "Nombre de prueba", dob: "not-for-response", isAdult: true, provider: "private" };
    } }) },
  };
  const code = ts.transpileModule(readFileSync("src/app/api/admin/padron/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const box = { exports: {} as { POST: (req: Request) => Promise<Response> } };
  runInNewContext(code, { module: box, exports: box.exports, require: (name: string) => mocks[name] ?? requireNode(name), Response });
  const call = (body: unknown) => box.exports.POST(new Request("https://contratacr.test/api/admin/padron", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { call, lookedUp, limits: () => limits };
}

test("padrón admin lookup rejects unauthorized callers before consulting the provider", async () => {
  const r = route({ admin: false });
  expect((await r.call({ cedula: "101053316" })).status).toBe(403);
  expect(r.lookedUp).toEqual([]); expect(r.limits()).toBe(0);
});
test("padrón lookup accepts formatted physical IDs and returns only the requested name", async () => {
  const r = route(); const response = await r.call({ cedula: "1-0105-3316" });
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ found: true, cedula: "101053316", fullName: "Nombre de prueba" });
  expect(r.lookedUp).toEqual(["101053316"]);
});
test("invalid IDs, legal IDs and foreign IDs never reach the electoral roll", async () => {
  const r = route();
  for (const cedula of ["", "000000000", "10105331", "3-101-123456", "12345678901", "1A1053316", null, 101053316]) {
    expect((await r.call({ cedula })).status).toBe(400);
  }
  expect(r.lookedUp).toEqual([]);
});
test("padrón not found and unavailable remain distinct and failures do not expose details", async () => {
  const missing = await route({ result: { found: false } }).call({ cedula: "101053316" });
  expect(missing.status).toBe(404); expect(await missing.json()).toEqual({ found: false, cedula: "101053316" });
  for (const options of [{ result: { unavailable: true } }, { fail: true }]) {
    const response = await route(options).call({ cedula: "101053316" });
    expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toMatch(/private|101053316/);
  }
});
test("admin lookup honors the rate limit without consulting or caching personal data", async () => {
  const r = route({ limited: true }); const response = await r.call({ cedula: "101053316" });
  expect(response.status).toBe(429); expect(response.headers.get("cache-control")).toBe("no-store"); expect(r.lookedUp).toEqual([]);
});
