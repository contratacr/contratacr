// Local candidate only. The sample configuration never enables real delivery.
export class PushScheduleError extends Error {
  constructor(code) { super(code); this.name = 'PushScheduleError'; this.code = code; }
}
export async function runPushTick(env, request = fetch) {
  const mode = env.MODE || 'off';
  if (mode === 'off') return { mode, skipped: true };
  if (!['check-only', 'deliver'].includes(mode)) throw new PushScheduleError('scheduler_invalid_mode');
  // A configuration mistake must never transmit this credential to another host.
  if (env.APP_ORIGIN !== 'https://contratacr.com') throw new PushScheduleError('scheduler_invalid_origin');
  if (typeof env.PUSH_WORKER_SECRET !== 'string' || env.PUSH_WORKER_SECRET.trim().length < 32) throw new PushScheduleError('scheduler_missing_secret');
  let response;
  try {
    response = await request(`${env.APP_ORIGIN}/api/internal/push/drain`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(50_000),
      headers: { Authorization: `Bearer ${env.PUSH_WORKER_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'check-only' ? { checkOnly: true } : { limit: 50 }),
    });
  } catch { throw new PushScheduleError('scheduler_request_failed'); }
  if (!response.ok) throw new PushScheduleError(`scheduler_http_${response.status}`);
  let result;
  try { result = await response.json(); } catch { throw new PushScheduleError('scheduler_invalid_response'); }
  if (!result || result.ok !== true) throw new PushScheduleError('scheduler_invalid_response');
  if (mode === 'check-only') {
    if (result.credentialReady !== true || result.sent !== 0) throw new PushScheduleError('scheduler_readiness_failed');
    return { mode, credentialReady: true, sent: 0 };
  }
  if (result.disabled === true) throw new PushScheduleError('scheduler_delivery_disabled');
  const fields = ['claimed', 'delivered', 'suppressed', 'retried', 'failed'];
  if (result.disabled !== false || fields.some(key => !Number.isInteger(result[key]) || result[key] < 0 || result[key] > 50)
    || result.claimed !== result.delivered + result.suppressed + result.retried + result.failed) throw new PushScheduleError('scheduler_invalid_response');
  // Only bounded totals. No recipient, notification ID, provider body or token.
  return { mode, ...Object.fromEntries(fields.map(key => [key, result[key]])) };
}
const worker = {
  async fetch() { return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }); },
  async scheduled(_controller, env) {
    try { console.log('[push-scheduler]', await runPushTick(env)); }
    catch (error) {
      const code = error instanceof PushScheduleError ? error.code : 'scheduler_failed';
      console.error('[push-scheduler]', { code });
      throw new Error(code);
    }
  },
};
export default worker;
