import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
// VM exports and the database double intentionally support runtime-selected shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Value = any;
const nativeRequire = createRequire(`${process.cwd()}/tests/e2e/admin-identifications-runtime.spec.ts`);
function load(file: string, mocks: Record<string, unknown> = {}) {
  const box = { exports: {} as Record<string, Value> };
  runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: box, exports: box.exports, require: (name: string) => mocks[name] ?? nativeRequire(name), Request, Response, Date, setTimeout, console });
  return box.exports;
}
const cedula = load("src/lib/cedula.ts");
const identity = load("src/lib/verification/identity-verifier.ts", { "@/lib/cedula": cedula, "./hacienda-cache": {} });
const owner = "11111111-1111-4111-8111-111111111111";
const proId = "22222222-2222-4222-8222-222222222222";
function fixture(extra: Record<string, Value[]> = {}) {
  const profile = { id: owner, full_name: "Nombre Prueba", cedula: "101053316", client_identity_status: "pending" };
  return { profiles: [profile], professionals: [{ id: proId, profile_id: owner, verification_status: "pending", is_verified: false, is_banned: false, profiles: profile }], ...extra };
}
function setup(initial = fixture(), options: { result?: Value; failTable?: string; preserveName?: boolean; authFail?: boolean } = {}) {
  const rows: Record<string, Value[]> = structuredClone(initial); const writes: Value[] = []; const calls: string[] = []; const runs: Value[] = []; const authWrites: Value[] = [];
  let lookups = 0;
  const db = { from(table: string) {
    let operation = "read", value: Value, single = false, range: number[] | undefined;
    const filters: ((row: Value) => boolean)[] = [];
    const query: Value = {
      select() { return query; }, in(key: string, values: Value[]) { filters.push(row => values.includes(row[key])); return query; }, eq(key: string, val: Value) { filters.push(row => row[key] === val); return query; },
      neq(key: string, val: Value) { filters.push(row => row[key] !== val); return query; }, order() { return query; }, range(start: number, end: number) { range = [start, end]; return query; },
      update(data: Value) { operation = "update"; value = data; return query; }, maybeSingle() { single = true; return query; },
      then(resolve: Value) {
        calls.push(table);
        if (options.failTable === table) return Promise.resolve({ data: null, error: new Error("database unavailable") }).then(resolve);
        let selected = (rows[table] ?? []).filter(row => filters.every(filter => filter(row)));
        if (range) selected = selected.slice(range[0], range[1] + 1);
        if (operation === "update") { writes.push({ table, value }); selected.forEach(row => Object.assign(row, value)); }
        return Promise.resolve({ data: single ? selected[0] ?? null : selected, error: null }).then(resolve);
      },
    }; return query;
  }, auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { keep: "original" } } }, error: null }), updateUserById: async (_id: string, data: Value) => { authWrites.push(data); return { error: options.authFail ? new Error("Auth unavailable") : null }; } } } };
  const result = options.result ?? { found: true, fullName: "NOMBRE PRUEBA", idType: "cedula", provider: "hacienda_api" };
  const service = load("src/lib/verification/admin-review.ts", {
    "@/lib/cedula": cedula,
    "./identity-verifier": { ...identity, getIdentityVerifier: () => ({ lookup: async () => { lookups++; return result; } }) },
    "./profile-name": { verifiedProfileName: async (_db: Value, _id: string, current: string, _cedula: string, official: string) => options.preserveName ? current : official },
    "./run-verification": { runIdentityVerification: async (id: string, opts: Value) => { runs.push({ id, opts }); rows.professionals.find(row => row.id === id)!.verification_status = "verified"; return "verified"; } },
    "@/lib/cache/professional-revision": { invalidateProfessionalCache: async () => {} },
  });
  return { service, db, rows, writes, calls, runs, authWrites, lookups: () => lookups };
}
const candidate = { accountId: owner, professionalId: proId, name: "Nombre Prueba", cedula: "101053316", type: "cedula", status: "pending", manualReason: null };

test("pending review pages through all records and excludes approved professionals from client duplicates", async () => {
  const initial = fixture();
  for (let i = 0; i < 600; i++) initial.professionals.push({ ...initial.professionals[0], id: `pro-${i}`, profile_id: `owner-${i}` });
  initial.professionals.push({ ...initial.professionals[0], id: "approved", profile_id: "approved-owner", verification_status: "verified" });
  initial.profiles.push({ ...initial.profiles[0], id: "approved-owner" }, { ...initial.profiles[0], id: "client-only" });
  const s = setup(initial); const rows = await s.service.pendingIdentities(s.db);
  expect(rows).toHaveLength(602); expect(rows.filter((row: Value) => row.accountId === owner)).toHaveLength(1);
  expect(rows.some((row: Value) => row.accountId === "approved-owner")).toBe(false);
  expect(rows.find((row: Value) => row.accountId === "client-only").professionalId).toBeNull(); expect(s.writes).toEqual([]);
});
for (const reason of ["appeal", "documents", "decision", "banned", "inconsistent", "no-id"]) test(`manual protection: ${reason} cannot be automatically approved`, async () => {
  const initial: Value = fixture();
  if (reason === "appeal") initial.professionals[0].verification_status = "under_appeal";
  if (reason === "documents") initial.support_tickets = [{ user_id: owner, topic: "verification_documents", status: "open" }];
  if (reason === "decision") initial.provider_verification_log = [{ professional_id: proId, action: "reverted_pending" }];
  if (reason === "banned") initial.professionals[0].is_banned = true;
  if (reason === "inconsistent") initial.professionals[0].is_verified = true;
  if (reason === "no-id") initial.profiles[0].cedula = null;
  const s = setup(initial); const [row] = await s.service.pendingIdentities(s.db);
  expect(row.manualReason).toBeTruthy();
  const review = await s.service.inspectPendingIdentity(row); expect(review.canVerify).toBe(false);
  expect((await s.service.verifyPendingIdentity(s.db, owner, row.cedula ?? "101053316")).outcome).not.toBe("verified");
  expect(s.runs).toEqual([]); expect(s.writes).toEqual([]);
});
for (const [result, kind] of [
  [{ found: true, fullName: "Nombre Prueba", idType: "cedula" }, "match"],
  [{ found: true, fullName: "Nombre Prueba", idType: "dimex" }, "match"],
  [{ found: true, fullName: "Nombre Prueba", idType: "nite" }, "match"],
  [{ found: true, fullName: "Empresa", idType: "juridica" }, "company"],
  [{ found: false }, "not_found"], [{ found: false, unavailable: true }, "unavailable"],
  [{ found: true, fullName: "Otra Persona Distinta", idType: "cedula" }, "name_mismatch"],
] as const) test(`read-only classification ${kind} ${result.found ? result.idType : "missing"}`, async () => {
  const s = setup(fixture(), { result }); const review = await s.service.inspectPendingIdentity(candidate);
  expect(review.kind).toBe(kind); expect(review.canVerify).toBe(kind === "match"); expect(s.writes).toEqual([]); expect(s.runs).toEqual([]);
});
test("explicit professional approval rechecks eligibility, scopes the saved document and sends no decision email", async () => {
  const s = setup();
  expect((await s.service.verifyPendingIdentity(s.db, owner, "999999999")).outcome).toBe("changed"); expect(s.lookups()).toBe(0);
  expect((await s.service.verifyPendingIdentity(s.db, owner, "101053316")).outcome).toBe("verified");
  expect(s.runs).toEqual([{ id: proId, opts: { notifyChannel: "in_app", expectedCedula: "101053316" } }]);
  expect((await s.service.verifyPendingIdentity(s.db, owner, "101053316")).outcome).toBe("changed"); expect(s.runs).toHaveLength(1);
});
test("a client-only match updates the account and open projects, preserving unrelated Auth metadata", async () => {
  const s = setup(fixture({ professionals: [], projects: [{ client_id: owner, status: "open" }, { client_id: owner, status: "closed" }] }));
  expect((await s.service.verifyPendingIdentity(s.db, owner, "101053316")).outcome).toBe("verified");
  expect(s.rows.profiles[0]).toMatchObject({ full_name: "NOMBRE PRUEBA", client_identity_status: "verified", client_identity_provider: "hacienda_api" });
  expect(s.rows.projects[0].client_identity_status).toBe("verified"); expect(s.rows.projects[1].client_identity_status).toBeUndefined();
  expect(s.authWrites[0].user_metadata).toEqual({ keep: "original", full_name: "NOMBRE PRUEBA" });
});
test("client verification keeps admin name corrections and stops if Auth synchronization fails", async () => {
  const kept = setup(fixture({ professionals: [] }), { preserveName: true });
  expect((await kept.service.verifyPendingIdentity(kept.db, owner, "101053316")).outcome).toBe("verified");
  expect(kept.rows.profiles[0].full_name).toBe("Nombre Prueba"); expect(kept.authWrites).toEqual([]);
  const failed = setup(fixture({ professionals: [] }), { authFail: true });
  expect(await failed.service.verifyPendingIdentity(failed.db, owner, "101053316").then(() => null, (error: unknown) => String(error))).toContain("Auth unavailable"); expect(failed.writes).toEqual([]);
});
test("history and document lookup failures fail closed before any automatic approval", async () => {
  for (const failTable of ["support_tickets", "provider_verification_log"]) {
    const s = setup(fixture(), { failTable }); expect(await s.service.verifyPendingIdentity(s.db, owner, "101053316").then(() => null, (error: unknown) => String(error))).toContain("database unavailable");
    expect(s.writes).toEqual([]); expect(s.runs).toEqual([]); expect(s.lookups()).toBe(0);
  }
});
test("admin review endpoints enforce admin access before reading or mutating identities", async () => {
  const mocks = { "@/lib/auth/admin": { getApiAdmin: async () => null }, "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("Must not reach database"); } }, "@/lib/rate-limit": {}, "@/lib/verification/admin-review": {}, "@/lib/audit/user-action": {} };
  for (const file of ["src/app/api/admin/identificaciones/route.ts", "src/app/api/admin/identificaciones/verificar/route.ts"]) {
    const route = load(file, mocks);
    if (route.GET) expect((await route.GET()).status).toBe(403);
    const response = await route.POST(new Request("https://contratacr.test/api/admin/identificaciones", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
test("review endpoint limits each read-only batch and never trusts client-supplied identity details", async () => {
  const inspected: Value[] = [];
  const route = load("src/app/api/admin/identificaciones/route.ts", {
    "@/lib/auth/admin": { getApiAdmin: async () => ({ id: "admin" }) }, "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    "@/lib/rate-limit": { enforceRateLimit: () => null }, "@/lib/verification/admin-review": {
      pendingIdentities: async () => [candidate], inspectPendingIdentity: async (row: Value) => { inspected.push(row); return { ...row, canVerify: false }; },
    },
  });
  const call = (body: Value) => route.POST(new Request("https://contratacr.test/api/admin/identificaciones", { method: "POST", body: JSON.stringify(body) }));
  for (const body of [{ ids: [] }, { ids: Array(4).fill(owner) }, { ids: ["not-a-uuid"] }]) expect((await call(body)).status).toBe(400);
  expect((await call({ ids: [owner], cedula: "victim-id", canVerify: true })).status).toBe(200); expect(inspected).toEqual([candidate]);
});
test("a single matching first name or an email address is insufficient for automatic approval", async () => {
  for (const name of ["Nombre", "nombre.prueba@example.test"]) {
    const s = setup(); expect((await s.service.inspectPendingIdentity({ ...candidate, name })).kind).toBe("name_mismatch");
    expect(s.writes).toEqual([]); expect(s.runs).toEqual([]);
  }
});
test("manual decisions beyond the first thousand history rows still protect their accounts", async () => {
  const initial: Value = fixture();
  initial.professionals.push({ ...initial.professionals[0], id: "later-pro", profile_id: "later-owner", profiles: { ...initial.profiles[0], id: "later-owner" } });
  initial.provider_verification_log = [...Array.from({ length: 1000 }, () => ({ professional_id: proId, action: "rejected" })), { professional_id: "later-pro", action: "reverted_pending" }];
  const s = setup(initial); const rows = await s.service.pendingIdentities(s.db);
  expect(rows.find((row: Value) => row.accountId === "later-owner").manualReason).toContain("decisión administrativa");
  expect(s.writes).toEqual([]);
});
