import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hasAdminSessionMfa } from "../../src/lib/auth/admin-mfa-policy";

function guard({ user = true, role = "admin", disabled = false, factor = true, aal = "aal2", age = 20, signatureError = false, subject = "admin" } = {}) {
  const code = ts.transpileModule(readFileSync("src/lib/auth/admin.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {} as { getApiAdmin: () => Promise<{ id: string } | null> };
  const mocks: Record<string, unknown> = {
    "react": { cache: (fn: unknown) => fn },
    "./admin-mfa-policy": { hasAdminSessionMfa },
    "next-intl/server": {}, "@/lib/prefijo-de-idioma": {}, "next/navigation": {},
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getClaims: async () => ({ error: signatureError ? new Error("Invalid JWT") : null, data: { claims: { sub: subject, aal, amr: [{ method: "totp", timestamp: Date.now() / 1000 - age }] } } }) } }) },
    "@/lib/supabase/get-user": { safeGetUser: async () => user ? { id: "admin", factors: factor ? [{ factor_type: "totp", status: "verified" }] : [] } : null },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role, is_disabled: disabled } }) }) }) }) }) },
  };
  runInNewContext(code, { exports, require: (id: string) => { if (!(id in mocks)) throw new Error(id); return mocks[id]; }, Date });
  return exports.getApiAdmin();
}
for (const [name, options] of Object.entries({ anonymous: { user: false }, nonAdmin: { role: "client" }, disabled: { disabled: true }, removedFactor: { factor: false }, passwordOnly: { aal: "aal1" }, future: { age: -60 }, forged: { signatureError: true }, otherSubject: { subject: "someone-else" } })) {
  test(`server admin guard rejects ${name}`, async () => { expect(await guard(options)).toBeNull(); });
}
test("server admin guard accepts only a live administrator with verified session MFA", async () => { expect(await guard()).toMatchObject({ id: "admin" }); });

test("opening the panel again does not expire the session second factor after 15 minutes", async () => { expect(await guard({ age: 3600 })).toMatchObject({ id: "admin" }); });
