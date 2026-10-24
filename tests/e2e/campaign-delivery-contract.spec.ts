import { expect, test } from "playwright/test";
import type { createAdminClient } from "../../src/lib/supabase/admin";
import { deliverCampaignOnce } from "../../src/lib/email/campaign-delivery";
import { campaignFromEvent, campanaDesdeAsunto } from "../../src/lib/email/campana";
import { eligibleCampaignRecipients, isRetiredCampaign, REVIEW_CAMPAIGN, SERVICES_CAMPAIGN, type CampaignHistory } from "../../src/lib/email/campaign-policy";
import { invitarAResenaDeGoogle } from "../../src/lib/notifications/invitacion-resena-google";
import { cuentasConExperiencia } from "../../src/lib/notifications/invitar-tras-experiencia";
import { empujarResenasYPrecio, tienePrecioReal } from "../../src/lib/notifications/empujones-del-perfil";
import { hasRecentOnceReceipt } from "../../src/lib/notifications/once";

type Admin = ReturnType<typeof createAdminClient>;
function deliveryDatabase(options: { reserveFailure?: boolean; confirmFailure?: boolean } = {}) {
  const rows = new Map<string, string>();
  const filter = (action: (matches: Record<string, string>) => { error: { code: string } | null }) => {
    const matches: Record<string, string> = {};
    const chain = {
      eq(key: string, value: string) { matches[key] = value; return chain; },
      then(resolve: (result: ReturnType<typeof action>) => unknown) { return Promise.resolve(action(matches)).then(resolve); },
    };
    return chain;
  };
  const db = {
    from() { return {
      async insert(row: { campana: string; email: string; status: string }) {
        if (options.reserveFailure) return { error: { code: "ledger_unavailable" } };
        const key = `${row.campana}|${row.email}`;
        if (rows.has(key)) return { error: { code: "23505" } };
        rows.set(key, row.status); return { error: null };
      },
      update(row: { status: string }) { return filter((where) => {
        if (options.confirmFailure) return { error: { code: "write_failed" } };
        const key = `${where.campana}|${where.email}`;
        if (rows.get(key) === where.status) rows.set(key, row.status);
        return { error: null };
      }); },
      delete() { return filter((where) => { rows.delete(`${where.campana}|${where.email}`); return { error: null }; }); },
    }; },
  } as unknown as Admin;
  return { db, rows };
}

const sent = { ok: true, status: "sent" as const, detail: null };

test.describe("campaign delivery and permanent notification contracts", () => {
  test("the preview mailbox never receives a real campaign or acquires a receipt", async () => {
    const { db, rows } = deliveryDatabase();
    let calls = 0;
    expect(await deliverCampaignOnce(db, REVIEW_CAMPAIGN.key, " IsaacSanchezMonge@gmail.com ", async () => {
      calls++; return { ok: true, status: "sent", detail: null };
    })).toBe("skipped");
    expect(calls).toBe(0);
    expect(rows.size).toBe(0);
  });
  test("simultaneous clicks reserve one recipient before sending", async () => {
    const { db, rows } = deliveryDatabase();
    let calls = 0;
    const results = await Promise.all(Array.from({ length: 20 }, () => deliverCampaignOnce(db, SERVICES_CAMPAIGN.key, " Client@Example.com ", async () => { calls++; return sent; })));
    expect(calls).toBe(1);
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
    expect(rows.get(`${SERVICES_CAMPAIGN.key}|client@example.com`)).toBe("sent");
  });

  test("missing ledger prevents contacting the email provider", async () => {
    const { db } = deliveryDatabase({ reserveFailure: true });
    let calls = 0;
    await expect(deliverCampaignOnce(db, "test", "client@example.com", async () => { calls++; return sent; })).rejects.toBeTruthy();
    expect(calls).toBe(0);
  });

  test("uncertain provider results are never automatically retried", async () => {
    const { db, rows } = deliveryDatabase();
    let calls = 0;
    expect(await deliverCampaignOnce(db, "test", "client@example.com", async () => { calls++; throw new Error("Connection lost after acceptance"); })).toBe("uncertain");
    expect(await deliverCampaignOnce(db, "test", "client@example.com", async () => { calls++; return sent; })).toBe("already_reserved");
    expect(calls).toBe(1);
    expect(rows.get("test|client@example.com")).toBe("uncertain");
  });

  test("failure to store confirmation retains the sending reservation", async () => {
    const { db, rows } = deliveryDatabase({ confirmFailure: true });
    let calls = 0;
    const send = async () => { calls++; return sent; };
    await expect(deliverCampaignOnce(db, "test", "client@example.com", send)).rejects.toBeTruthy();
    expect(await deliverCampaignOnce(db, "test", "client@example.com", send)).toBe("already_reserved");
    expect(rows.get("test|client@example.com")).toBe("sending");
    expect(calls).toBe(1);
  });

  test("a local quota skip releases the unused reservation", async () => {
    const { db, rows } = deliveryDatabase();
    expect(await deliverCampaignOnce(db, "test", "client@example.com", async () => ({ ok: false, status: "skipped", detail: "No quota" }))).toBe("skipped");
    expect(rows.size).toBe(0);
    expect(await deliverCampaignOnce(db, "test", "client@example.com", async () => sent)).toBe("sent");
  });

  test("recipient counts exclude old sends, unsubscribes, bounces, recent campaigns and duplicates", () => {
    const now = Date.parse("2026-10-10T18:00:00Z");
    const old = "2026-09-01T18:00:00Z";
    const row = (email: string, campana: string, extra: Partial<CampaignHistory> = {}): CampaignHistory => ({ email, campana, enviado_en: old, status: "sent", ...extra });
    const history = [
      row("old@example.com", SERVICES_CAMPAIGN.key),
      row("alias@example.com", campanaDesdeAsunto("263 profesionales verificados, en un solo lugar")),
      row("bounced@example.com", "older-campaign", { rebote_en: old }),
      row("recent@example.com", "other-campaign", { enviado_en: "2026-10-09T18:00:00Z" }),
      row("uncertain@example.com", "other-campaign", { status: "uncertain" }),
    ];
    const accounts = ["old", "alias", "bounced", "recent", "uncertain", "unsubscribed", "fresh", "FRESH"].map((name) => ({ email: `${name}@example.com` }));
    expect(eligibleCampaignRecipients(accounts, history, [" UNSUBSCRIBED@EXAMPLE.COM "], now)).toEqual([{ email: "fresh@example.com" }]);
    expect(eligibleCampaignRecipients([{ email: "other@example.com" }], [row("other@example.com", "other-campaign")], [], now)).toHaveLength(1);
  });

  test("only the reviewed first-review email campaign is available", () => {
    expect(isRetiredCampaign("resenas", "pros_sin_resenas")).toBe(false);
    expect(isRetiredCampaign("precio", "pros_sin_precio")).toBe(true);
    expect(isRetiredCampaign("recordatorio", "todas")).toBe(true);
    expect(isRetiredCampaign(undefined, "pros_sin_precio")).toBe(true);
    expect(eligibleCampaignRecipients([{ email: "pro@example.com" }], [{ email: "pro@example.com", campana: REVIEW_CAMPAIGN.key, enviado_en: "2026-09-01T00:00:00Z", status: "sent" }], [], Date.parse("2026-10-11T00:00:00Z"), REVIEW_CAMPAIGN.historyKeys)).toHaveLength(0);
  });

  test("Brevo event tags preserve identity after a subject edit", () => {
    for (const event of [
      { tag: SERVICES_CAMPAIGN.key },
      { tags: [], tag: SERVICES_CAMPAIGN.key },
      { tags: [SERVICES_CAMPAIGN.key] },
      { tag: JSON.stringify([SERVICES_CAMPAIGN.key]) },
    ]) expect(campaignFromEvent({ ...event, subject: "A different subject" })).toBe(SERVICES_CAMPAIGN.key);
    expect(campaignFromEvent({ subject: "Legacy subject" })).toBe("legacy-subject");
    expect(campaignFromEvent({})).toBeNull();
  });

  test("Google invitations fail closed when their permanent history is unavailable", async () => {
    let inserts = 0;
    const query = { in() { return query; }, async then(resolve: (r: { data: null; error: { code: string } }) => unknown) { return resolve({ data: null, error: { code: "missing_receipts" } }); } };
    const db = { from(table: string) { if (table === "notifications") inserts++; return { select() { return query; } }; } } as unknown as Admin;
    await expect(invitarAResenaDeGoogle(db, ["client-id"])).rejects.toBeTruthy();
    expect(inserts).toBe(0);
  });

  test("Google invitation eligibility reads all pages of actual interactions", async () => {
    const pages: number[] = [];
    const projects = Array.from({ length: 1005 }, (_, index) => ({ client_id: `client-${index}` }));
    const db = { from(table: string) {
      const chain = {
        select() { return chain; }, gte() { return chain; }, lte() { return chain; }, order() { return chain; },
        async range(from: number, to: number) {
          if (table === "projects") { pages.push(from); return { data: projects.slice(from, to + 1), error: null }; }
          return { data: [], error: null };
        },
      };
      return chain;
    } } as unknown as Admin;
    expect(await cuentasConExperiencia(db)).toHaveLength(1005);
    expect(pages).toEqual([0, 1000]);
  });

  test("reference price detection excludes negotiation and placeholder text", () => {
    expect(tienePrecioReal([{ price: "Consultar precio" }])).toBe(false);
    expect(tienePrecioReal([{ price: "A convenir" }])).toBe(false);
    expect(tienePrecioReal([{ priceAmount: 15000, priceType: "a_convenir" }])).toBe(false);
    expect(tienePrecioReal([{ priceAmount: 15000, active: false }])).toBe(false);
    expect(tienePrecioReal([{ price: "Desde ₡15.000" }])).toBe(true);
    expect(tienePrecioReal([{ priceAmount: 15000 }])).toBe(true);
  });

  test("the price reminder waits four days even if a first review has already arrived", async () => {
    const now = Date.parse("2026-10-10T18:00:00Z");
    const simulate = async (days: number, priceAlreadySent = false) => {
      const receipts = [{ user_id: "pro", type: "pide_resenas", status: "sent", sent_at: new Date(now - days * 86_400_000).toISOString() }];
      if (priceAlreadySent) receipts.push({ user_id: "pro", type: "agrega_precio", status: "sent", sent_at: new Date(now - 20 * 86_400_000).toISOString() });
      const db = { from(table: string) {
        const chain = {
          select() { return chain; }, not() { return chain; }, eq() { return chain; }, order() { return chain; }, in() { return chain; },
          async range(from: number) { return { error: null, data: from ? [] : [{ profile_id: "pro", created_at: "2026-09-01T00:00:00Z", review_count: 1, services: [] }] }; },
          then(resolve: (r: { data: typeof receipts; error: null }) => unknown) { return Promise.resolve({ data: receipts, error: null }).then(resolve); },
        };
        if (table !== "professionals" && table !== "notification_once_receipts") throw new Error("Simulation must never insert");
        return chain;
      } } as unknown as Admin;
      return empujarResenasYPrecio(db, { simular: true, ahora: now });
    };
    expect(await simulate(2)).toEqual({ resenas: 0, precio: 0 });
    expect(await simulate(4)).toEqual({ resenas: 0, precio: 1 });
    expect(await simulate(4, true)).toEqual({ resenas: 0, precio: 0 });
  });

  test("reminders wait 24 hours even if the preceding notification was deleted", () => {
    const now = Date.parse("2026-10-10T18:00:00Z");
    expect(hasRecentOnceReceipt([{ user_id: "client", type: "completa_perfil", status: "sent", sent_at: "2026-10-10T00:00:00Z" }], "client", now)).toBe(true);
    expect(hasRecentOnceReceipt([{ user_id: "client", type: "pide_resenas", status: "sent", sent_at: "2026-10-08T00:00:00Z" }], "client", now)).toBe(false);
  });
});
