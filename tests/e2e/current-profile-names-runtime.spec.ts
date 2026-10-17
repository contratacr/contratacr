/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated route exports and dynamic PostgREST test doubles. */
import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const nativeRequire = createRequire(`${process.cwd()}/tests/e2e/current-profile-names-runtime.spec.ts`);
function load(path: string, mocks: Record<string, unknown>) {
  const box = { exports: {} as Record<string, (...args: any[]) => any> };
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: box, exports: box.exports, require: (id: string) => mocks[id] ?? nativeRequire(id), Response, URL });
  return box.exports;
}
function setup(options: { authorized?: boolean; profileError?: boolean } = {}) {
  const original = ["Marco Antonio Nu", "ez Fernandez"].join("?");
  const profiles = [{ id: "owner", full_name: "Marco Antonio Nunez Fernandez" }];
  const tickets = [{ id: "ticket", user_id: "owner", name: original, email: "shared@example.test", status: "open" }, { id: "guest", user_id: null, name: "Guest name", email: "shared@example.test", status: "open" }];
  const messages = [{ id: "message", ticket_id: "ticket", sender_role: "user", sender_id: "owner", sender_name: original, body: original },
    { id: "claimed-message", ticket_id: "ticket", sender_role: "user", sender_id: null, sender_name: original, body: "original text" },
    { id: "admin-message", ticket_id: "ticket", sender_role: "admin", sender_id: "owner", sender_name: "Support signature", body: "Support reply" }];
  const tables: Record<string, any[]> = { profiles, support_tickets: tickets, support_ticket_messages: messages };
  const profileReads: string[][] = []; const writes: string[] = [];
  const db = { from(table: string) {
    const filters: ((row: any) => boolean)[] = []; let single = false;
    const q: any = {
      select: () => q, order: () => q,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      neq: () => q, is: () => q, ilike: () => q,
      update: () => { writes.push(table); return q; },
      in: (key: string, ids: string[]) => { if (table === "profiles") profileReads.push(ids); filters.push(row => ids.includes(row[key])); return q; },
      single: () => { single = true; return q; }, maybeSingle: () => { single = true; return q; },
      then(resolve: (value: unknown) => void) {
        const rows = tables[table].filter(row => filters.every(filter => filter(row)));
        resolve({ data: single ? rows[0] ?? null : rows, count: rows.length, error: table === "profiles" && options.profileError ? { message: "offline" } : null });
      },
    }; return q;
  } };
  const names = load("src/lib/profiles/current-names.ts", {});
  const support = load("src/lib/support/current-names.ts", { "@/lib/profiles/current-names": names });
  const mocks = {
    "@/lib/support/current-names": support,
    "@/lib/auth/admin": { getApiAdmin: async () => options.authorized === false ? null : { id: "admin" } },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.authorized === false ? null : { id: "owner", email: "shared@example.test" } } }) } }) },
    "@/lib/support-notify": {}, "@/lib/text-limits": {}, "@/lib/push/notify": {}, "@/lib/support/close-reasons": {}, "@/lib/rate-limit": {}, "@/lib/audit/user-action": {}, "@/lib/after-response": {},
    "@/lib/support/adjuntos": { firmarAdjuntos: async (_db: unknown, rows: unknown) => rows },
  };
  const admin = load("src/app/api/admin/support/route.ts", mocks);
  const user = load("src/app/api/support/route.ts", mocks);
  return { db, names, support, profiles, tickets, messages, profileReads, writes, admin, user, original };
}

test("admin support lists and detail use the corrected account name on every request", async () => {
  const s = setup();
  const response = await s.admin.GET(new Request("https://example.test/api/admin/support?status=open"));
  const list = await response.json();
  expect(list.tickets[0].name).toBe(s.profiles[0].full_name); expect(list.tickets[1].name).toBe("Guest name");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const detail = await (await s.admin.GET(new Request("https://example.test/api/admin/support?id=ticket"))).json();
  expect(detail.ticket.name).toBe(s.profiles[0].full_name);
  expect(detail.messages[0].sender_name).toBe(s.profiles[0].full_name); expect(detail.messages[1].sender_name).toBe(s.profiles[0].full_name);
  expect(detail.messages[2].sender_name).toBe("Support signature"); expect(detail.messages[0].body).toBe(s.original);
  s.profiles[0].full_name = "A second correction";
  const fresh = await (await s.admin.GET(new Request("https://example.test/api/admin/support?id=ticket"))).json();
  expect(fresh.ticket.name).toBe("A second correction");
  expect(s.tickets[0].name).toBe(s.original); expect(s.messages[0].sender_name).toBe(s.original); expect(s.writes).toEqual([]);
});
test("the account's own support panel resolves the same current labels", async () => {
  const s = setup();
  const list = await (await s.user.GET(new Request("https://example.test/api/support"))).json();
  expect(list.tickets[0].name).toBe(s.profiles[0].full_name);
  const detail = await (await s.user.GET(new Request("https://example.test/api/support?id=ticket"))).json();
  expect(detail.ticket.name).toBe(s.profiles[0].full_name); expect(detail.messages[0].sender_name).toBe(s.profiles[0].full_name);
});
test("guest and deleted account snapshots remain available without matching accounts by email", async () => {
  const s = setup(); s.profiles.splice(0);
  const value = await s.support.withCurrentSupportNames(s.db, s.tickets, s.messages);
  expect(value.tickets[0].name).toBe(s.original); expect(value.tickets[1].name).toBe("Guest name");
  expect(value.messages[0].sender_name).toBe(s.original);
  expect(s.profileReads).toEqual([["owner"]]);
});
test("identity lookup is deduplicated and batched, and profile failures cannot silently return old labels", async () => {
  const s = setup(); const ids = Array.from({ length: 205 }, (_, i) => `id-${i}`);
  await s.names.getCurrentProfileNames(s.db, [...ids, ...ids, null]);
  expect(s.profileReads.map(ids => ids.length)).toEqual([100, 100, 5]);
  const broken = setup({ profileError: true });
  const error = await broken.support.withCurrentSupportNames(broken.db, broken.tickets).then(() => null, (error: Error) => error.message);
  expect(error).toContain("nombres actuales");
});
test("support routes enforce account and admin permissions before resolving identities", async () => {
  const s = setup({ authorized: false });
  expect((await s.admin.GET(new Request("https://example.test/api/admin/support?id=ticket"))).status).toBe(403);
  expect((await s.user.GET(new Request("https://example.test/api/support?id=ticket"))).status).toBe(401);
  expect(s.profileReads).toEqual([]); expect(s.writes).toEqual([]);
});
