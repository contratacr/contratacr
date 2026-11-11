// Isolated PostgreSQL (PGlite) check of migration 267: chat notifications keep
// the 202 rule (one unread notice per conversation) and carry the sender.
// No external DB, no messages sent.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
  create schema if not exists auth;
  create table public.profiles (id uuid primary key, full_name text);
  create table public.direct_conversations (id uuid primary key, client_id uuid, professional_profile_id uuid, booking_id uuid, project_id uuid);
  create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, message text, data jsonb, read boolean not null default false, created_at timestamptz not null default now());
  create table public.direct_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, body text);
`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/267_notification_sender_profile.sql', import.meta.url), 'utf8'));
await db.exec(`create trigger t after insert on public.direct_messages for each row execute function public.notify_direct_message_recipient();`);
const [client, pro, conv] = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1'];
await db.query(`insert into public.profiles values ($1,'Cliente Ejemplo'),($2,'Pro Ejemplo')`, [client, pro]);
await db.query(`insert into public.direct_conversations (id, client_id, professional_profile_id) values ($1,$2,$3)`, [conv, client, pro]);
const send = (sender, body) => db.query(`insert into public.direct_messages (conversation_id, sender_id, body) values ($1,$2,$3)`, [conv, sender, body]);
const notes = async user => (await db.query(`select message, read, data from public.notifications where user_id=$1 order by created_at`, [user])).rows;

await send(client, 'Primer mensaje'); await send(client, 'Segundo mensaje');
let rows = await notes(pro);
assert.equal(rows.length, 1, 'two unread messages leave one notice');
assert.equal(rows[0].message, 'Segundo mensaje', 'the notice shows the latest message');
assert.equal(rows[0].data.actor_profile_id, client); assert.equal(rows[0].data.actor_name, 'Cliente Ejemplo');
assert.equal(rows[0].data.conversation_id, conv); assert.match(rows[0].data.link, /conversation=/);

await db.query(`update public.notifications set read = true where user_id=$1`, [pro]);
await send(client, 'Tercero, ya leído lo anterior');
rows = await notes(pro);
assert.equal(rows.length, 2, 'after reading, a new message creates a new notice');

await send(pro, 'Respuesta del profesional');
rows = await notes(client);
assert.equal(rows.length, 1); assert.equal(rows[0].data.actor_name, 'Pro Ejemplo');
await send(client, 'x'.repeat(120));
assert.ok((await notes(pro)).at(-1).message.endsWith('...'), 'long messages are summarized');
console.log('PASS direct-message notifications: one unread notice per conversation, latest text, sender identity, new notice after read.');
