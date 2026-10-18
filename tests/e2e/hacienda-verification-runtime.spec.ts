import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Transpiled VM exports and the stateful database double have runtime-selected shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeValue = any;

const requireNode = createRequire(`${process.cwd()}/tests/e2e/hacienda-verification-runtime.spec.ts`);
function load(file: string, mocks: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const box = { exports: {} as Record<string, RuntimeValue> };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module: box, exports: box.exports, require: (name: string) => mocks[name] ?? (name === "@/lib/verification/review-eligibility" ? eligibility : requireNode(name)), Response, Request, AbortSignal, Date, Buffer, console, ...globals });
  return box.exports;
}
const cedula = load("src/lib/cedula.ts");
const eligibility = load("src/lib/verification/review-eligibility.ts", { "@/lib/cedula": cedula });
const found = (idType = "cedula") => ({ found: true, fullName: "Nombre oficial", idType, provider: "hacienda_api", dob: null, isAdult: false });
function provider(replies: (Response | Error)[]) {
  const calls: string[] = []; const cache = new Map<string, RuntimeValue>(); let now = 100000;
  const mod = load("src/lib/verification/identity-verifier.ts", {
    "@/lib/cedula": cedula,
    "./hacienda-cache": { readHaciendaCache: async (id: string) => cache.get(id), writeHaciendaCache: async (id: string, result: RuntimeValue) => cache.set(id, result) },
  }, { Date: class extends Date { static now() { return now; } }, fetch: async (url: string, options: RequestInit) => {
    // Workers supports manual/follow; redirect:error fails before any network I/O.
    expect(options.redirect).toBe("manual");
    calls.push(url); const response = replies.shift(); if (response instanceof Error) throw response; if (!response) throw new Error("unexpected request"); return response;
  } });
  return { verifier: new mod.HaciendaIdentityVerifier(), calls, cache, advance: (ms: number) => { now += ms; } };
}
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

for (const [id, type, code] of [["101053316", "cedula", "01"], ["2100042005", "juridica", "02"], ["12345678901", "dimex", "03"], ["123456789012", "dimex", "03"], ["9999999999", "nite", "04"]]) {
  test(`Hacienda queries ${type} ${id.length} digits and keeps only minimum data`, async () => {
    const p = provider([json({ nombre: " Nombre   oficial ", tipoIdentificacion: code, situacion: { moroso: "SI" }, actividades: ["private"] })]);
    const result = await p.verifier.lookup(id);
    expect(result).toEqual(found(type));
    expect(p.calls).toEqual([`https://api.hacienda.go.cr/fe/ae?identificacion=${id}`]);
    expect(JSON.stringify([...p.cache.values()])).not.toMatch(/moroso|actividades|situacion/);
    expect(await p.verifier.lookup(id)).toEqual(found(type)); expect(p.calls).toHaveLength(1);
  });
}
test("invalid and oversized IDs never leave the app; official types override local heuristics", async () => {
  const p = provider([json({ nombre: "Nombre oficial", tipoIdentificacion: "04" })]);
  for (const id of ["", "1A1053316", "000000000", "1234567890123", "9?99999999"]) {
    expect(cedula.isValidId(id)).toBe(false); expect((await p.verifier.lookup(id)).found).toBe(false);
  }
  expect(p.calls).toHaveLength(0);
  expect((await p.verifier.lookup("2-100-042005")).idType).toBe("nite");
});
test("404 is missing and cached; server errors, malformed responses and timeouts are unavailable and uncached", async () => {
  const missing = provider([json({ code: 404 }, 404)]);
  expect(await missing.verifier.lookup("999999999")).toMatchObject({ found: false });
  expect((await missing.verifier.lookup("999999999")).unavailable).toBeUndefined(); expect(missing.calls).toHaveLength(1);
  for (const reply of [json({}, 500), json({}, 404), new Response("proxy error", { status: 404 }), json({ nombre: "", tipoIdentificacion: "01" }), json({ nombre: null }), json({ nombre: "Person", tipoIdentificacion: "99" }), json({ nombre: "Person", tipoIdentificacion: "02" }), new Response("not JSON"), new Error("timeout")]) {
    const p = provider([reply]); expect(await p.verifier.lookup("101053316")).toMatchObject({ found: false, unavailable: true }); expect(p.cache.size).toBe(0);
  }
});
test("429 pauses lookups without turning an outage into a negative decision", async () => {
  const p = provider([new Response("", { status: 429, headers: { "Retry-After": "120" } }), json({ nombre: "Nombre oficial", tipoIdentificacion: "01" })]);
  expect((await p.verifier.lookup("101053316")).unavailable).toBe(true);
  expect((await p.verifier.lookup("101053317")).unavailable).toBe(true); expect(p.calls).toHaveLength(1);
  p.advance(120001); expect((await p.verifier.lookup("101053316")).found).toBe(true); expect(p.calls).toHaveLength(2);
});
test("shared cache TTL is ten minutes for matches and one minute for missing records; failures are not cached", async () => {
  let now = 100000; const objects = new Map<string, string>();
  const cache = load("src/lib/verification/hacienda-cache.ts", {
    "@/lib/promise-timeout": { withPromiseTimeout: async (value: RuntimeValue) => value },
    "@opennextjs/cloudflare": { getCloudflareContext: async () => ({ env: { NEXT_INC_CACHE_R2_BUCKET: {
      get: async (key: string) => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)!) } : null,
      put: async (key: string, value: string) => { objects.set(key, value); },
    } } }) },
  }, { Date: class extends Date { static now() { return now; } } });
  await cache.writeHaciendaCache("101053316", found());
  await cache.writeHaciendaCache("999999999", { ...found(), found: false, fullName: null });
  await cache.writeHaciendaCache("101053317", { ...found(), unavailable: true });
  expect(objects.size).toBe(2); expect([...objects.keys()].join()).not.toMatch(/101053316|999999999/);
  now += 60001; expect(await cache.readHaciendaCache("999999999")).toBeNull(); expect(await cache.readHaciendaCache("101053316")).toEqual(found());
  now += 540000; expect(await cache.readHaciendaCache("101053316")).toBeNull();
});

// Stateful database double: conditions and ignoreDuplicates apply to real rows.
function database(initial: Record<string, RuntimeValue[]> = {}) {
  const rows: Record<string, RuntimeValue[]> = structuredClone(initial); const writes: { table: string; op: string; value: RuntimeValue }[] = [];
  const db = { from(table: string) {
    let op = "read", value: RuntimeValue, options: RuntimeValue; const filters: ((row: RuntimeValue) => boolean)[] = []; let single = false;
    const q: RuntimeValue = {
      select() { return q; }, eq(k: string, v: RuntimeValue) { filters.push(r => r[k] === v); return q; }, neq(k: string, v: RuntimeValue) { filters.push(r => r[k] !== v); return q; },
      in(k: string, values: RuntimeValue[]) { filters.push(r => values.includes(r[k])); return q; }, order() { return q; }, limit() { return q; },
      maybeSingle() { single = true; return q; }, update(v: RuntimeValue) { op = "update"; value = v; return q; },
      insert(v: RuntimeValue) { op = "insert"; value = v; return q; }, upsert(v: RuntimeValue, opts: RuntimeValue) { op = "upsert"; value = v; options = opts; return q; },
      then(resolve: RuntimeValue) {
        rows[table] ??= []; let selected = rows[table].filter(r => filters.every(f => f(r)));
        if (op !== "read") {
          writes.push({ table, op, value });
          if (op === "update") selected.forEach(r => Object.assign(r, value));
          else { const existing = rows[table].find(r => r.id && r.id === value.id); if (!existing) rows[table].push({ ...value }); else if (!options?.ignoreDuplicates) Object.assign(existing, value); selected = [existing ?? rows[table].at(-1)]; }
        }
        // PostgREST returns a response snapshot, not references to mutable rows.
        return Promise.resolve({ data: structuredClone(single ? selected[0] ?? null : selected), error: null }).then(resolve);
      },
    }; return q;
  }, auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: {} } } }), updateUserById: async () => ({ error: null }) } } };
  return { db, rows, writes };
}
function verification(result: RuntimeValue, status = "pending", name = "Nombre oficial") {
  const state = database({ professionals: [{ id: "pro", profile_id: "owner", verification_status: status, is_verified: status === "verified", profiles: { full_name: name, cedula: "101053316" } }], profiles: [{ id: "owner", cedula: "101053316", full_name: name }], projects: [{ client_id: "owner", status: "open" }] });
  let lookups = 0; const notifications: RuntimeValue[] = [];
  const mod = load("src/lib/verification/run-verification.ts", {
    "@/lib/cache/professional-revision": { invalidateProfessionalCache: async () => {} },
    "@/lib/supabase/admin": { createAdminClient: () => state.db }, "@/lib/cedula": cedula,
    "@/lib/verification/identity-verifier": { getIdentityVerifier: () => ({ lookup: async () => { lookups++; return result; } }) },
    "@/lib/verification/profile-name": { verifiedProfileName: async () => name },
    "@/lib/verification-notify": { notifyVerificationDecision: async (v: RuntimeValue) => notifications.push(v), notifyVerificationOutreach: async () => notifications.push("outreach") },
  });
  return { ...state, run: (options = {}) => mod.runIdentityVerification("pro", { isInitial: true, notifyChannel: "in_app", ...options }), notifications, lookups: () => lookups };
}
for (const type of ["cedula", "dimex", "nite"]) test(`record found for ${type} verifies account and open projects`, async () => {
  const v = verification(found(type)); expect(await v.run()).toBe("verified");
  expect(v.rows.professionals[0].is_verified).toBe(true); expect(v.rows.profiles[0].client_identity_status).toBe("verified");
  expect(v.rows.projects[0].client_identity_status).toBe("verified"); expect(v.notifications).toHaveLength(1);
});
test("all found ID types accept the official record; missing records remain eligible to appeal", async () => {
  for (const type of ["cedula", "juridica", "dimex", "nite"]) {
    const v = verification(found(type)); expect(await v.run()).toBe("verified");
    expect(v.rows.professionals[0].is_verified).toBe(true);
    expect(v.rows.professionals[0].verification_reason).toBeNull();
  }
  const v = verification({ ...found(), found: false, fullName: null });
  expect(await v.run()).toBe("pending"); expect(v.rows.professionals[0].verification_reason).toBe(eligibility.ID_NOT_FOUND_REASON);
  expect(eligibility.canRequestIdentityReview(v.rows.professionals[0], "101053316")).toBe(true);
});
test("temporary outage preserves account state and sends no rejection or outreach", async () => {
  const v = verification({ ...found(), unavailable: true }); expect(await v.run()).toBe("skipped");
  expect(v.writes.map(w => w.table)).toEqual(["provider_verification_log"]); expect(v.notifications).toEqual([]); expect(v.rows.professionals[0].verification_status).toBe("pending");
});
test("human approval and appeals are never taken over by automatic checks", async () => {
  for (const status of ["verified", "under_appeal", "rejected"]) {
    const v = verification(found(), status); expect(await v.run()).toBe(status === "verified" ? "verified" : "ticket");
    expect(v.lookups()).toBe(0); expect(v.writes).toEqual([]); expect(v.notifications).toEqual([]);
  }
});
test("a prior human decision or open document case prevents automatic approval of a found record", async () => {
  for (const type of ["history", "documents"]) {
    const v = verification(found("juridica"));
    if (type === "history") v.rows.provider_verification_log = [{ professional_id: "pro", action: "reverted_pending" }];
    else v.rows.support_tickets = [{ user_id: "owner", topic: "verification_documents", status: "open" }];
    expect(await v.run()).toBe("ticket"); expect(v.lookups()).toBe(0); expect(v.writes).toEqual([]);
  }
});
test("manual appeals reuse one case/message per identity and preserve admin handling", async () => {
  const state = database({ professionals: [{ id: "pro", verification_status: "pending" }] });
  const documents = load("src/lib/verification/documents.ts", { "@/lib/supabase/admin": { createAdminClient: () => state.db } });
  const mod = load("src/lib/verification/manual-review.ts", { "./documents": documents });
  const owner = { id: "owner", cedula: "101053316", full_name: "Current name", email: "owner@example.test" };
  const id = await mod.requestManualVerification(state.db, owner, "pro", "Please review");
  state.rows.support_tickets[0].status = "in_progress";
  expect(await mod.requestManualVerification(state.db, owner, "pro", "Retry")).toBe(id);
  expect(state.rows.support_tickets).toHaveLength(1); expect(state.rows.support_ticket_messages).toHaveLength(1); expect(state.rows.provider_appeals).toHaveLength(1);
  expect(state.rows.support_tickets[0].status).toBe("in_progress"); expect(state.rows.support_ticket_messages[0].body).toBe("Please review");
  expect(state.rows.professionals[0].verification_status).toBe("under_appeal");
  state.rows.professionals[0].verification_status = "verified";
  await mod.requestManualVerification(state.db, owner, "pro", "Retry after approval"); expect(state.rows.professionals[0].verification_status).toBe("verified");
  state.rows.provider_verification_log = [{ id: "new-decision", professional_id: "pro", action: "rejected" }];
  expect(await mod.requestManualVerification(state.db, owner, "pro", "New appeal")).not.toBe(id);
  expect(state.rows.support_tickets).toHaveLength(2);
});
test("appeal route authenticates, ignores caller-supplied professional IDs and blocks profile mismatches", async () => {
  for (const scenario of ["anonymous", "mismatch", "ok", "limited", "long"]) {
    let sent = 0; let ownerSeen = "";
    const state = database({ professionals: [{ id: "own-pro", profile_id: "owner", verification_status: "pending", verification_provider: "hacienda_api", verification_reason: eligibility.ID_NOT_FOUND_REASON, profiles: { id: scenario === "mismatch" ? "other" : "owner", cedula: "101053316" } }] });
    const mod = load("src/app/api/appeals/route.ts", {
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: scenario === "anonymous" ? null : { id: "owner" } } }) } }) },
      "@/lib/supabase/admin": { createAdminClient: () => state.db },
      "@/lib/rate-limit": { enforceRateLimit: () => scenario === "limited" ? new Response("", { status: 429 }) : null },
      "@/lib/verification/manual-review": { requestManualVerification: async (_db: RuntimeValue, owner: RuntimeValue, pro: string) => { sent++; ownerSeen = owner.id + ":" + pro; return "case"; } },
    });
    const response = await mod.POST(new Request("https://contratacr.test/api/appeals", { method: "POST", body: JSON.stringify({ professionalId: "victim", message: scenario === "long" ? "x".repeat(2001) : "Review" }) }));
    expect(response.status).toBe(({ anonymous: 401, mismatch: 503, ok: 200, limited: 429, long: 400 } as RuntimeValue)[scenario]);
    expect(sent).toBe(scenario === "ok" ? 1 : 0); if (sent) expect(ownerSeen).toBe("owner:own-pro");
  }
});
test("changing an approved ID clears its old approval before saving the new document", async () => {
  const state = database({ professionals: [{ id: "pro", profile_id: "owner", verification_status: "verified", is_verified: true }], profiles: [{ id: "owner", cedula: "101053316", client_identity_status: "verified" }] });
  const mod = load("src/app/api/add-cedula/route.ts", {
    "@/lib/api-errors": { mensajeDeError: (_req: Request, values: { es: string }) => values.es },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => state.db }, "@/lib/rate-limit": { enforceRateLimit: () => null },
    "@/lib/verification/run-verification": { runIdentityVerification: async () => "skipped" },
  });
  const response = await mod.POST(new Request("https://contratacr.test/api/add-cedula", { method: "POST", body: JSON.stringify({ cedula: "9999999999" }) }));
  expect(response.status).toBe(200); expect((await response.json()).outcome).toBe("skipped");
  expect(state.writes[0]).toMatchObject({ table: "professionals", value: { verification_status: "pending", is_verified: false } });
  expect(state.writes[1]).toMatchObject({ table: "profiles", value: { cedula: "9999999999", client_identity_status: "pending" } });
  expect(state.rows.professionals[0].is_verified).toBe(false); expect(state.rows.profiles[0].client_identity_status).toBe("pending");
});
test("publishing a project cannot synchronize an automatic approval over a manual appeal", async () => {
  const state = database({ professionals: [{ id: "pro", profile_id: "owner", verification_status: "under_appeal", is_verified: false }] });
  const mod = load("src/lib/verification/account-identity.ts");
  await mod.syncProfessionalVerificationFromAccount(state.db, "owner", "verified", "hacienda_api");
  expect(state.writes).toEqual([]); expect(state.rows.professionals[0].verification_status).toBe("under_appeal");
});
test("retrying an existing document submission enters manual review without duplicate uploads", async () => {
  const state = database({ professionals: [{ id: "pro", profile_id: "owner", verification_status: "pending", is_verified: false, verification_provider: "hacienda_api", verification_reason: eligibility.ID_NOT_FOUND_REASON, profiles: { cedula: "101053316", full_name: "Owner", email: "owner@example.test" } }] });
  const documents = load("src/lib/verification/documents.ts", { "@/lib/supabase/admin": { createAdminClient: () => state.db } });
  const ticketId = documents.documentCaseId("owner", "101053316", null);
  state.rows.support_ticket_messages = [{ id: ticketId, ticket_id: ticketId }];
  const mod = load("src/app/api/verification/documents/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => state.db }, "@/lib/rate-limit": { enforceRateLimit: () => null },
    "@/lib/cedula": cedula, "@/lib/upload-validation": {}, "@/lib/support/adjuntos": {}, "@/lib/verification/documents": documents,
  });
  const response = await mod.POST(new Request("https://contratacr.test/api/verification/documents", { method: "POST" }));
  expect(response.status).toBe(200); expect((await response.json()).ticketId).toBe(ticketId);
  expect(state.rows.professionals[0].verification_status).toBe("under_appeal");
  expect(state.rows.support_ticket_messages).toHaveLength(1); expect(state.writes).toHaveLength(1);
  state.rows.professionals[0].verification_status = "verified";
  expect((await mod.POST(new Request("https://contratacr.test/api/verification/documents", { method: "POST" }))).status).toBe(409);
  expect(state.writes).toHaveLength(1);
});

test("an admin review cannot verify a document changed after its inspection", async () => {
  const v = verification(found());
  expect(await v.run({ expectedCedula: "999999999" })).toBe("skipped");
  expect(v.lookups()).toBe(0); expect(v.writes).toEqual([]);
});

test("manual review requires an actual negative result for the current identification", () => {
  const missing = { verification_status: "pending", verification_provider: "hacienda_api", verification_reason: eligibility.ID_NOT_FOUND_REASON };
  expect(eligibility.canRequestIdentityReview(missing, "101053316")).toBe(true);
  expect(eligibility.canRequestIdentityReview({ ...missing, verification_status: "under_appeal" }, "101053316")).toBe(true);
  for (const id of [null, "", "invalid"]) expect(eligibility.canRequestIdentityReview(missing, id)).toBe(false);
  for (const patch of [{ verification_status: "verified" }, { is_verified: true }, { verification_provider: null }, { verification_reason: null }, { verification_reason: "Servicio no disponible" }]) {
    expect(eligibility.canRequestIdentityReview({ ...missing, ...patch }, "101053316")).toBe(false);
  }
  expect(eligibility.canRequestIdentityReview({ ...missing, verification_reason: "No encontramos esta identificación en Hacienda. Puedes apelar para revisión manual; esto no significa que sea inválida." }, "101053316")).toBe(true);
});

for (const target of ["users", "providers"] as const) {
  test(`explicit ${target} admin approval after a reversal persists account and professional verification`, async () => {
    const state = database({
      profiles: [{ id: "owner", cedula: "199999999", client_identity_status: "pending" }],
      professionals: [{ id: "pro", profile_id: "owner", verification_status: "pending", is_verified: false }],
      projects: [{ id: "open-project", client_id: "owner", status: "open", client_identity_status: "pending" }],
      provider_verification_log: [{ id: "previous", professional_id: "pro", action: "reverted_pending" }],
    });
    const path = target === "users" ? "src/app/api/admin/users/[id]/identity/route.ts" : "src/app/api/admin/providers/[id]/decision/route.ts";
    const route = load(path, {
      "@/lib/auth/admin": { getApiAdmin: async () => ({ id: "operator", fullName: "Regression administrator" }) },
      "@/lib/supabase/admin": { createAdminClient: () => state.db },
      "@/lib/verification-notify": { notifyVerificationDecision: async () => {} },
    });
    const response = await route.POST(new Request("https://contratacr.test/api/admin/identity", { method: "POST", body: JSON.stringify({ action: "verify" }) }), { params: Promise.resolve({ id: target === "users" ? "owner" : "pro" }) });
    expect(response.status).toBe(200);
    expect(state.rows.professionals[0]).toMatchObject({ verification_status: "verified", is_verified: true });
    expect(state.rows.profiles[0]).toMatchObject({ cedula: "199999999", client_identity_status: "verified" });
    expect(state.rows.projects[0].client_identity_status).toBe("verified");
    const log = state.writes.find(write => write.table === "provider_verification_log" && write.op === "insert")?.value;
    expect(Array.isArray(log) ? log : [log]).toContainEqual(expect.objectContaining({ action: "verified", from_status: "pending", to_status: "verified" }));
  });
}
