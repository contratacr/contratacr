/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic PostgREST query doubles and isolated VM exports. */
import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Deliberately construct a damaged legacy name to exercise its correction.
const damagedName = ["Marco Antonio Nu", "ez Fernandez"].join("?");

const nativeRequire = createRequire(`${process.cwd()}/tests/e2e/admin-profile-edit-runtime.spec.ts`);
function load(path: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const box = { exports: {} as Record<string, (...args: any[]) => any> };
  runInNewContext(code, { module: box, exports: box.exports, require: (id: string) => mocks[id] ?? nativeRequire(id), Response, console, ...globals });
  return box.exports;
}
function fixture(options: { authorized?: boolean; authFail?: boolean; writeFail?: string; missingWrite?: string } = {}) {
  const tables: Record<string, any[]> = {
    profiles: [{ id: "owner", full_name: damagedName, email: "old@example.test", phone: "50688881111", cedula: "101234567" }],
    professionals: [{ id: "pro", profile_id: "owner", business_name: "Negocio", whatsapp: "50688881111", call_phone: "50688881111" }],
    job_posts: [{ id: "job", employer_id: "pro", contact_whatsapp: "50688881111" }, { id: "other-contact", employer_id: "pro", contact_whatsapp: "50677772222" }],
    professional_offers: [{ id: "offer", professional_id: "pro", contact_whatsapp: "50688881111" }],
  };
  const auth = { app_metadata: { provider: "email" }, email: "old@example.test", user_metadata: { full_name: tables.profiles[0].full_name, keep: "untouched" } };
  const audits: any[] = []; const invalidations: any[] = []; let authWrites = 0;
  const db = {
    from(table: string) {
      const filters: ((row: any) => boolean)[] = []; let patch: any; let single = false;
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
        neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return q; },
        ilike: (key: string, value: string) => { filters.push(row => row[key]?.toLowerCase() === value.toLowerCase()); return q; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; },
        limit: () => q,
        update: (value: unknown) => { patch = value; return q; },
        maybeSingle: () => { single = true; return q; }, single: () => { single = true; return q; },
        then(resolve: (value: unknown) => void) {
          const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
          if (patch && options.writeFail === table) return resolve({ data: null, error: { message: "write failed" } });
          if (patch && options.missingWrite === table) return resolve({ data: null, error: { message: "No matching row" } });
          if (patch) rows.forEach(row => Object.assign(row, patch));
          return resolve({ data: single ? rows[0] ?? null : rows, error: null });
        },
      }; return q;
    },
    auth: { admin: {
      getUserById: async () => ({ data: { user: auth }, error: null }),
      updateUserById: async (_id: string, value: any) => {
        authWrites++;
        if (options.authFail) return { error: { message: "Auth unavailable" } };
        Object.assign(auth, value); return { error: null };
      },
    } },
  };
  const route = load("src/app/api/admin/users/[id]/datos/route.ts", {
    "@/lib/admin/read-all-rows": load("src/lib/admin/read-all-rows.ts", {}),
    "@/lib/auth/admin": { getApiAdmin: async () => options.authorized === false ? null : { id: "admin" } },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/audit/user-action": { auditUserAction: async (_db: unknown, _req: unknown, entry: unknown) => { audits.push(entry); } },
    "@/lib/quotes": { whatsappDigits: (v: unknown) => String(v ?? "").replace(/\D/g, "") },
    "@/lib/auth/enlace-de-contrasena": {},
    "@/lib/cache/professional-revision": { invalidateProfessionalCache: async () => { invalidations.push(["public-professionals", { expire: 0 }]); } },
  });
  const call = (body: object) => route.PATCH(new Request("https://contratacr.test/api/admin/users/owner/datos", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "owner" }) });
  return { call, tables, auth, audits, invalidations, authWrites: () => authWrites };
}

test("admin edits persist every supported field, preserve Auth metadata and propagate only matching contacts", async () => {
  const f = fixture(); const body = { full_name: "Marco Antonio Nunez Fernández", business_name: "Arte Ñ", whatsapp: "50688883333", call_phone: "50688884444", email: "NEW@example.test" };
  const response = await f.call(body);
  expect(response.status).toBe(200);
  expect(f.tables.profiles[0]).toMatchObject({ full_name: body.full_name, phone: body.whatsapp, email: "new@example.test" });
  expect(f.tables.professionals[0]).toMatchObject({ business_name: body.business_name, whatsapp: body.whatsapp, call_phone: body.call_phone });
  expect(f.auth.user_metadata).toEqual({ full_name: body.full_name, keep: "untouched" });
  expect(f.auth.app_metadata).toMatchObject({ provider: "email", admin_profile_name: { name: body.full_name, cedula: "101234567" } });
  expect(f.tables.job_posts.map(row => row.contact_whatsapp)).toEqual([body.whatsapp, "50677772222"]);
  expect(f.tables.professional_offers[0].contact_whatsapp).toBe(body.whatsapp);
  expect(f.audits[0]).toMatchObject({ actorRole: "admin", afterData: { nombre: body.full_name }, metadata: { name_cedula: "101234567" } });
  expect(f.invalidations).toEqual([["public-professionals", { expire: 0 }]]);
  const again = await f.call(body); expect(await again.json()).toEqual({ ok: true, sinCambios: true });
  expect(f.audits).toHaveLength(1); expect(f.authWrites()).toBe(1);
});
test("only changed fields are written and calls following the old WhatsApp follow its replacement", async () => {
  const f = fixture(); expect((await f.call({ whatsapp: "50688883333" })).status).toBe(200);
  expect(f.tables.professionals[0].call_phone).toBe("50688883333");
  expect(f.tables.profiles[0].full_name).toBe(damagedName); expect(f.authWrites()).toBe(0);
  expect((await f.call({ call_phone: "" })).status).toBe(200); expect(f.tables.professionals[0].call_phone).toBeNull();
});
test("Auth failure cannot report success or write profile data, and a later retry persists", async () => {
  const f = fixture({ authFail: true }); const res = await f.call({ full_name: "Nombre corregido" });
  expect(res.status).toBe(500); expect(f.tables.profiles[0].full_name).toContain("?");
  expect(f.audits).toHaveLength(0); expect(f.invalidations).toHaveLength(0);
  const retry = fixture(); expect((await retry.call({ full_name: "Nombre corregido" })).status).toBe(200);
});
test("retry repairs stale Auth metadata even when the profile name already matches", async () => {
  const f = fixture(); f.tables.profiles[0].full_name = "Nombre corregido";
  expect((await f.call({ full_name: "Nombre corregido" })).status).toBe(200);
  expect(f.auth.user_metadata.full_name).toBe("Nombre corregido");
});
test("failed or missing database updates are never acknowledged as saved", async () => {
  for (const options of [{ writeFail: "profiles" }, { missingWrite: "profiles" }, { writeFail: "professionals" }, { missingWrite: "professionals" }]) {
    const f = fixture(options); const res = await f.call({ full_name: "Corregido", business_name: "Otro" });
    expect(res.status).toBe(500); expect(f.audits).toHaveLength(0); expect(f.invalidations).toHaveLength(0);
  }
});
test("a failed publication contact update stays retryable and is never reported as saved", async () => {
  const options = { writeFail: "professional_offers" }; const f = fixture(options);
  expect((await f.call({ whatsapp: "50688883333" })).status).toBe(503);
  expect(f.tables.professionals[0].whatsapp).toBe("50688881111"); expect(f.audits).toHaveLength(0);
  options.writeFail = "";
  expect((await f.call({ whatsapp: "50688883333" })).status).toBe(200);
  expect(f.tables.professionals[0].whatsapp).toBe("50688883333");
  expect(f.tables.professional_offers[0].contact_whatsapp).toBe("50688883333");
});

test("admin guard and invalid input prevent all writes", async () => {
  const unauthorized = fixture({ authorized: false }); expect((await unauthorized.call({ full_name: "X" })).status).toBe(403); expect(unauthorized.authWrites()).toBe(0);
  for (const body of [{ full_name: " " }, { business_name: "" }, { whatsapp: "123" }, { call_phone: "12" }, { email: "invalid" }]) {
    const f = fixture(); expect((await f.call(body)).status).toBe(400); expect(f.authWrites()).toBe(0); expect(f.audits).toHaveLength(0);
  }
});

test("successful official lookup always supplies the complete name, including after an admin correction", async () => {
  const { verifiedProfileName } = load("src/lib/verification/profile-name.ts", {});
  const db: any = { from: () => { throw new Error("No unrelated history lookup is necessary"); } };
  expect(await verifiedProfileName(db, "owner", "Marco Nunez", "101234567", "MARCO ANTONIO NUÑEZ FERNANDEZ")).toBe("MARCO ANTONIO NUÑEZ FERNANDEZ");
  expect(await verifiedProfileName(db, "owner", "Marco Nunez", "109876543", "OTRO NOMBRE COMPLETO")).toBe("OTRO NOMBRE COMPLETO");
});


test("editing clears every cached admin directory variant, including storage, without clearing other data", async () => {
  const storage = new Map<string, string>();
  const api = load("src/lib/dashboard-prefetch-cache.ts", {}, { window: { sessionStorage: {
    get length() { return storage.size; }, key: (i: number) => [...storage.keys()][i] ?? null,
    getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
  } } });
  api.setDashboardCache("admin:users:page=1", { name: "Old" });
  api.setDashboardCache("admin:users:q=marco", { name: "Old" });
  api.setDashboardCache("other:keep", { keep: true });
  let notified = false;
  api.subscribeDashboardCache("admin:users:page=1", () => { notified = true; });
  api.olvidarDashboardCachePrefix("admin:users:");
  expect(api.getDashboardCache("admin:users:page=1")).toBeNull(); expect(api.getDashboardCache("admin:users:q=marco")).toBeNull();
  expect([...storage.keys()]).toEqual(["ccr:dashboard-cache:other:keep"]);
  expect(api.getDashboardCache("other:keep")).toEqual({ keep: true }); expect(notified).toBe(true);
});

test("Cloudflare edits publish a fresh shared revision and cache failures bypass stale entries", async () => {
  let value: string | null = null; let fail = false; const keys: string[] = [];
  const bucket = {
    get: async (key: string) => { keys.push(key); if (fail) throw new Error("R2 down"); return value === null ? null : { text: async () => value }; },
    put: async (key: string, next: string) => { keys.push(key); value = next; },
  };
  const api = load("src/lib/cache/professional-revision.ts", {
    react: { cache: (fn: unknown) => fn },
    "next/cache": { revalidateTag: () => { throw new Error("Cloudflare has no tag cache"); } },
    "@/lib/promise-timeout": { withPromiseTimeout: (promise: unknown) => promise },
    "@opennextjs/cloudflare": { getCloudflareContext: async () => ({ env: { NEXT_INC_CACHE_R2_BUCKET: bucket } }) },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://project.example.test" } }, URL, crypto: { randomUUID: () => "new-revision" } });
  expect(await api.professionalRevision()).toBe("initial");
  await api.invalidateProfessionalCache(); expect(await api.professionalRevision()).toBe("new-revision");
  expect(new Set(keys)).toEqual(new Set(["professional-revision/v1/project.example.test"]));
  fail = true; expect(await api.professionalRevision()).toBeNull();
});
