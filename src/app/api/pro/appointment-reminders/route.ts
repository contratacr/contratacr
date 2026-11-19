import { z } from 'zod';
import {safeGetUser} from '@/lib/pro/workspace-user';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getApiAdmin } from '@/lib/auth/admin';
import { enforceRateLimit } from '@/lib/rate-limit';

const headers = { 'Cache-Control': 'no-store, private' };
const input = z.object({
  enabled: z.boolean(),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  actionId: z.string().uuid(),
}).strict();

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers });
}

// This staged feature must never reach a remote database, even in development.
function localRuntime() {
  return process.env.NODE_ENV === 'development'
    && /^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
}

async function readInput(req: Request) {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('invalid_input');
  }
  const reader = req.body?.getReader();
  if (!reader) throw new Error('invalid_input');
  let size = 0;
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
    return input.parse(JSON.parse(text));
  } finally {
    reader.releaseLock();
  }
}

async function run(req: Request, write: boolean) {
  if (!localRuntime()) return new Response(null, { status: 404, headers });
  if (write) {
    const url = new URL(req.url);
    const origin = `${url.protocol}//${req.headers.get('host') || url.host}`;
    if (req.headers.get('origin') !== origin) return fail(403, 'invalid_origin');
  }
  try {
    const user = await safeGetUser(await createClient());
    if (!user) return fail(401, 'sign_in_required');
    const db = createAdminClient();
    const profile = await db.from('profiles').select('role,is_disabled').eq('id', user.id).maybeSingle();
    if (profile.error) return fail(503, 'unavailable');
    if (!profile.data || profile.data.is_disabled || (profile.data.role === 'admin' && !await getApiAdmin())) {
      return fail(403, 'access_denied');
    }
    const limited = await enforceRateLimit(req, `appointment-reminders-${user.id}`, 60, 60_000);
    if (limited) return limited;
    let value = null;
    if (write) {
      try { value = await readInput(req); }
      catch (error) {
        return error instanceof Error && error.message === 'body_too_large'
          ? fail(413, 'body_too_large') : fail(400, 'invalid_input');
      }
    }
    const result = await db.rpc('pro_appointment_reminder_preferences_record', {
      p_actor: user.id, p_input: value,
    });
    if (result.error) {
      const code = result.error.code;
      if (code === '42501') return fail(403, 'access_denied');
      if (code === '40001' || code === '23505') return fail(409, 'revision_conflict');
      if (code === '22023' || code === '22P02') return fail(400, 'invalid_input');
      return fail(503, 'unavailable');
    }
    return Response.json(result.data, { headers });
  } catch {
    return fail(503, 'unavailable');
  }
}

export async function GET(req: Request) { return run(req, false); }
export async function POST(req: Request) { return run(req, true); }
