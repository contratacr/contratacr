import {test,expect} from 'playwright/test';
import {digestTickMinute,runScheduledProDigest} from '../../src/lib/pro/scheduled-digest';

// Row 24: the Worker cron calls the digest tick; the digest is sandbox-only (records, no provider).
test('the cron calls the tick only at minute 5 of the hour and only where Pro is enabled',async()=>{
 const calls:string[]=[];const handle=async(r:Request)=>{calls.push(r.url+'|'+r.headers.get('authorization'));return new Response('{}');};
 const t5=Date.parse('2026-11-24T13:05:00Z'),t6=Date.parse('2026-11-24T13:06:00Z');
 expect(digestTickMinute(t5)).toBe(true);expect(digestTickMinute(t6)).toBe(false);
 expect(await runScheduledProDigest(handle,{PRO_ENABLED:'false',CRON_SECRET:'s'},{},t5)).toBe('skipped');
 expect(await runScheduledProDigest(handle,{PRO_ENABLED:'true',CRON_SECRET:'s'},{},t6)).toBe('skipped');
 expect(await runScheduledProDigest(handle,{PRO_ENABLED:'true'},{},t5)).toBe('not_configured');
 expect(await runScheduledProDigest(handle,{PRO_ENABLED:'true',CRON_SECRET:'s'},{},t5)).toBe('ok');
 expect(calls).toEqual(['https://contratacr.com/api/internal/pro/digest-tick|Bearer s']);
 expect(await runScheduledProDigest(async()=>{throw new Error('x');},{PRO_ENABLED:'true',CRON_SECRET:'s'},{},t5)).toBe('failed');
});
test('the tick route refuses callers without the worker secret',async({request})=>{
 const r=await request.post('/api/internal/pro/digest-tick');expect([401,503,404]).toContain(r.status());
 const bad=await request.post('/api/internal/pro/digest-tick',{headers:{Authorization:'Bearer wrong'}});expect([401,503,404]).toContain(bad.status());
});
