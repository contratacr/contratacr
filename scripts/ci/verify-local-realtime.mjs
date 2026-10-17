import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('Realtime readiness must target the isolated local stack.');
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
