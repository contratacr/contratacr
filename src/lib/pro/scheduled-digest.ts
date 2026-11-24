type Env={PRO_ENABLED?:string;PUSH_WORKER_SECRET?:string;CRON_SECRET?:string};
type WorkerFetch<E,C>=(request:Request,env:E,ctx:C)=>Promise<Response>;
/** The digest hour is checked in SQL (idempotent per person and hour), so the Worker only needs to call once a few minutes into each hour. */
export function digestTickMinute(scheduledTime:number){return new Date(scheduledTime).getUTCMinutes()===5;}
/** Row 24: Worker cron entry for the Pro digest. Runs only where PRO_ENABLED is "true" (the test Worker); never throws into the push drain. */
export async function runScheduledProDigest<E extends Env,C>(handle:WorkerFetch<E,C>,env:E,ctx:C,scheduledTime:number){
 if(env.PRO_ENABLED!=='true'||!digestTickMinute(scheduledTime))return 'skipped';
 const secret=env.PUSH_WORKER_SECRET||env.CRON_SECRET;if(!secret)return 'not_configured';
 try{const r=await handle(new Request('https://contratacr.com/api/internal/pro/digest-tick',{method:'POST',headers:{Authorization:'Bearer '+secret}}),env,ctx);return r.ok?'ok':'failed';}catch{return 'failed';}
}
