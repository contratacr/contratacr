// Run against an isolated in-memory Postgres, never a real account or provider.
// PGLITE_MODULE_PATH may point to a disposable installation outside the repo.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.profiles (id uuid primary key, is_disabled boolean not null default false);
    create table public.notifications (
      id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id),
      type text not null, title text not null, created_at timestamptz not null default now(), read boolean default false
    );
    create table public.admin_campaign_sends (
      id uuid primary key default gen_random_uuid(), campana text not null, email text not null,
      enviado_en timestamptz not null default now(), unique (campana, email)
    );
    create table public.test_push_outbox (notification_id uuid);
    create function public.test_push_capture() returns trigger language plpgsql as $$
    begin insert into public.test_push_outbox values (new.id); return new; end; $$;
    create trigger test_push after insert on public.notifications for each row execute function public.test_push_capture();
  `);
  await db.query("insert into profiles (id) values ($1), ($2)", [id(1), id(2)]);
  await db.query("insert into notifications (user_id,type,title,created_at) values ($1,'resena_google','Old invitation',now()-interval '2 days')", [id(1)]);
  await db.exec(await readFile(new URL("../supabase/migrations/230_resena_google_una_vez.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../supabase/migrations/236_avisos_una_vez_y_campanas_seguras.sql", import.meta.url), "utf8");
  await db.exec(`begin; ${migration} commit;`);
  const initial = await db.query("select status from notification_once_receipts order by user_id");
  assert.deepEqual(initial.rows.map((r) => r.status), ["sent", "historical_unknown"]);
  let checks = 1;
  const invite = (userId, type = "resena_google") => db.query(
    "insert into notifications (user_id,type,title) values ($1,$2,'Test') returning id", [userId, type]);
  await db.query("delete from notifications where user_id=$1", [id(1)]);
  assert.equal((await invite(id(1))).rows.length, 0);
  assert.equal((await invite(id(2))).rows.length, 0); checks += 2;
  await db.query("insert into profiles (id) values ($1),($2),($3),($4),($5)", [id(3), id(4), id(5), id(6), id(7)]);
  assert.equal((await invite(id(3), "completa_perfil")).rows.length, 1);
  assert.equal((await invite(id(3))).rows.length, 0); checks++;
  await db.query("update notification_once_receipts set sent_at=now()-interval '25 hours' where user_id=$1", [id(3)]);
  assert.equal((await invite(id(3))).rows.length, 1);
  await db.query("update notifications set read=true where user_id=$1", [id(3)]);
  await db.query("delete from notifications where user_id=$1", [id(3)]);
  assert.equal((await invite(id(3))).rows.length, 0); checks++;
  const races = await Promise.all(Array.from({ length: 20 }, () => invite(id(4))));
  assert.equal(races.reduce((total, result) => total + result.rows.length, 0), 1);
  const pushes = await db.query("select count(*)::int as n from test_push_outbox where notification_id in (select id from notifications where user_id=$1)", [id(4)]);
  assert.equal(pushes.rows[0].n, 1); checks++;
  assert.equal((await invite(id(4), "pide_resenas")).rows.length, 0); checks++;
  await assert.rejects(db.query("insert into notifications (user_id,type,title) values ($1,'resena_google',null)", [id(5)]));
  assert.equal((await db.query("select * from notification_once_receipts where user_id=$1", [id(5)])).rows.length, 0);
  assert.equal((await invite(id(5))).rows.length, 1); checks++;
  await db.query("update profiles set is_disabled=true where id=$1", [id(6)]);
  assert.equal((await invite(id(6))).rows.length, 0); checks++;
  await db.exec("set role authenticated");
  await assert.rejects(db.query("delete from notification_once_receipts"));
  await assert.rejects(db.query("select * from notification_once_receipts"));
  await db.exec("reset role"); checks++;
  await db.query("insert into admin_campaign_sends(campana,email,status) values ('test','test@example.com','sending')");
  await assert.rejects(db.query("insert into admin_campaign_sends(campana,email,status) values ('test','test@example.com','sending')"));
  assert.equal((await db.query("select status from admin_campaign_sends")).rows[0].status, "sending"); checks++;
  console.log(`${checks} isolated Postgres checks passed: backfill, deletion, unknown history, cooldown, repeated inserts, push, rollback, inactive accounts, privacy and email reservation.`);
} finally { await db.close(); }
