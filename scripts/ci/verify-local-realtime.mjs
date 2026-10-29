import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('Realtime readiness must target the isolated local stack.');
}
// A channel can acknowledge SUBSCRIBED even when the application table was
// never added to the publication during an empty local rebuild. Check that
// prerequisite explicitly, without repairing/mutating the database here.
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl || !['127.0.0.1', 'localhost'].includes(new URL(dbUrl).hostname)) {
  throw new Error('Realtime metadata requires the isolated local database.');
}
const db = new URL(dbUrl);
let metadata;
try {
  metadata = JSON.parse(execFileSync('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', `
    select json_build_object(
      'walLogical', current_setting('wal_level') = 'logical',
      'messagesPublished', exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'),
      'conversationsPublished', exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_conversations'),
      'activeLogicalSlots', (select count(*) from pg_replication_slots where slot_type = 'logical' and active)
    );
  `], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, PGHOST: db.hostname, PGPORT: db.port || '5432', PGDATABASE: db.pathname.slice(1),
    PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password), PGCONNECT_TIMEOUT: '5',
  } }));
} catch {
  // Never print a connection URL, password, or raw database error here.
  throw new Error('Could not inspect isolated Realtime replication metadata.');
}
console.log('Local Realtime metadata:', JSON.stringify(metadata));
if (!metadata.walLogical || !metadata.messagesPublished || !metadata.conversationsPublished) {
  throw new Error('Local Realtime publication prerequisites are missing.');
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('Missing local service role.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const channel = client.channel('regression-realtime-readiness')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => {});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local Realtime did not become ready within 20 seconds.')), 20_000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        clearTimeout(timer);
        reject(new Error(`Local Realtime readiness failed: ${status}`));
      }
    });
  });
  console.log('Local Realtime subscription is ready.');
} finally {
  await client.removeChannel(channel);
}
