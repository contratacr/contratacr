// Explicit local runner only. No scheduler installation or external delivery.
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';

const args=process.argv.slice(2);
const watch=args.includes('--watch');
const clockArgument=args.find(arg=>arg.startsWith('--as-of='));
const clock=clockArgument?.slice(8);
if(args.some(arg=>arg!=='--watch'&&!arg.startsWith('--as-of='))||args.filter(arg=>arg.startsWith('--as-of=')).length>1||watch&&clockArgument!==undefined)throw Error('Use no arguments, --watch, or --as-of=<ISO timestamp> for a single local test.');
if(clockArgument!==undefined&&(!clock||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(clock)||!Number.isFinite(Date.parse(clock))))throw Error('Invalid UTC test clock.');
if(clock&&new Date(clock).toISOString()!==clock.replace(/(?:\.(\d{1,3}))?Z$/,(_,fraction)=>'.'+(fraction??'').padEnd(3,'0')+'Z'))throw Error('Invalid UTC calendar date.');
// Local runs read .env.test; CI exports the same variables in the environment instead.
const env=await readFile(new URL('../../.env.test',import.meta.url),'utf8').then(parseEnv,error=>{if(error?.code!=='ENOENT')throw error;return process.env;});
if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL??''))throw Error('Refusing non-loopback Supabase.');
if(!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Local service configuration unavailable.');
const endpoint='http://127.0.0.1:54321';
const client=createClient(endpoint,env.SUPABASE_SERVICE_ROLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false},
 global:{fetch:(url,options)=>{
  if(new URL(url).origin!==endpoint)throw Error('Refusing external request.');
  return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30_000)});
 }},
});
async function tick(){
 let pages=0,total=0;
 while(true){
  const {data,error}=await client.rpc('pro_appointment_reminders_run',{
   ...(clock?{p_as_of:clock}:{}),p_limit:100,
  });
  if(error)throw Error(`Local reminder runner failed (${error.code??'unknown'}).`);
  if(!data||!Number.isSafeInteger(data.created)||data.created<0||typeof data.hasMore!=='boolean')throw Error('Unexpected local runner response.');
  total+=data.created;pages++;
  if(!data.hasMore){console.log(JSON.stringify({local:true,created:total,pages,pushDelivery:false}));return;}
  if(pages>=100)throw Error('Local reminder batch limit reached; remaining rows were not processed.');
 }
}
do{await tick();if(watch)await delay(60_000);}while(watch);
