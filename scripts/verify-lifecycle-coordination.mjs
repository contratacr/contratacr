import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname), 'Local synthetic database only');
const db = createClient(origin,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const email = `coordination-${randomUUID()}@contratacr.test`;
const changed = `changed-${randomUUID()}@contratacr.test`;
const day = new Date().toISOString().slice(0,10);
let id, quota;
async function checked(promise) { const r=await promise; if(r.error) throw r.error; return r.data; }
try {
  const user = await checked(db.auth.admin.createUser({email,password:randomUUID()+randomUUID(),email_confirm:true}));
  id=user.user.id;
  await checked(db.from('profiles').upsert({id,email,role:'client',is_disabled:false}));
  const claim=(campaign,address=email) => checked(db.rpc('claim_outreach_email',{p_campaign:campaign,p_email:address}));
  const results=await Promise.all([claim('coordination-a'),claim('coordination-b')]);
  assert.equal(results.filter(Boolean).length,1,'Different campaigns must serialize');
  const first=results[0]?'coordination-a':'coordination-b';
  assert.equal(await claim(first),false,'Same campaign is permanent');
  await checked(db.from('profiles').update({email:changed}).eq('id',id));
  assert.equal(await claim(first,changed),false,'Changing email cannot repeat a campaign');
  assert.equal(await claim('coordination-c',changed),false,'Account cooldown survives email changes');
  await checked(db.from('admin_campaign_sends').update({status:'sent',enviado_en:new Date(Date.now()-15*86400000).toISOString()}).eq('profile_id',id));
  assert.equal(await claim(first,changed),false);
  assert.equal(await claim('coordination-c',changed),true,'New campaign can follow after fourteen days');
  await checked(db.from('admin_campaign_sends').delete().eq('profile_id',id));
  quota=await checked(db.from('email_cuota_diaria').select('*').eq('dia',day).eq('nivel','masivo').maybeSingle());
  await checked(db.from('email_cuota_diaria').upsert({dia:day,nivel:'masivo',enviados:250},{onConflict:'dia,nivel'}));
  assert.equal(await claim('coordination-quota',changed),false,'Fifty sends stay reserved');
  console.log('Lifecycle SQL: concurrency, permanent receipts, email changes, cooldown and quota passed');
} finally {
  if(quota) await checked(db.from('email_cuota_diaria').upsert(quota,{onConflict:'dia,nivel'}));
  else await checked(db.from('email_cuota_diaria').delete().eq('dia',day).eq('nivel','masivo'));
  if(id) { await checked(db.from('admin_campaign_sends').delete().eq('profile_id',id)); await checked(db.auth.admin.deleteUser(id)); }
}
