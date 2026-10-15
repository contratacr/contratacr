import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";
import { POST } from "../../src/app/api/internal/email/drain/route";

function harness({ status = 201, code = "", networkFailure = false, receiptFailure = false, claimed = true } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const requests: { body: Record<string, unknown>; options: { headers: Record<string, string> } }[] = [];
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({name,args});
    if (name === "enqueue_email_delivery") return {data:"00000000-0000-4000-8000-000000000001",error:null};
    if (name === "claim_email_delivery") return {data:claimed ? {id:"00000000-0000-4000-8000-000000000001",attempt_token:"lease",attempts:1,purpose:"activity",payload:{subject:"Hello",tags:["aviso-proyecto"]}} : null,error:null};
    return receiptFailure ? {data:null,error:{message:"DB unavailable"}} : {data:true,error:null};
  }, from: () => ({select: () => ({eq: () => ({single:async()=>({data:{status:"accepted"},error:null})})})}) };
  type Result = {ok:boolean;status:string;detail:string|null};
  const box = {exports:{} as {deliverRecordedEmail:(input:unknown)=>Promise<Result>;processEmailDelivery:(id:string)=>Promise<Result>;providerOutcome:(status:number,code?:string)=>string}};
  const mocks:Record<string,unknown>={"node:crypto":{createHash},"@/lib/supabase/admin":{createAdminClient:()=>db},"./revalidate-campaign":{queuedCampaignEligible:async()=>true,queuedActivityEligible:async()=>true}};
  runInNewContext(ts.transpileModule(readFileSync("src/lib/email/outbox.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    module:box,exports:box.exports,require:(name:string)=>mocks[name],process:{env:{BREVO_API_KEY:"synthetic-key"}},AbortSignal,
    fetch:async (_url:string,options:{body:string;headers:Record<string,string>})=>{
      requests.push({body:JSON.parse(options.body),options});
      if(networkFailure)throw Error("Timeout");
      return {ok:status>=200&&status<300,status,json:async()=>status===201?{messageId:"<synthetic@provider>"}:{code}};
    },
  });
  return {api:box.exports,calls,requests};
}

test("email worker rejects unauthenticated dispatch",async()=>{
  const result=await POST(new Request("https://contratacr.test/api/internal/email/drain",{method:"POST"}));
  expect([401,503]).toContain(result.status);
});
test("provider receipt and idempotency header are recorded separately from delivery",async()=>{
  const h=harness();expect((await h.api.processEmailDelivery("receipt")).status).toBe("sent");
  expect(h.requests).toHaveLength(1);
  expect(h.requests[0].body.headers).toMatchObject({idempotencyKey:"00000000-0000-4000-8000-000000000001"});
  expect(h.requests[0].body.tags).toContain("ccr-mail-00000000-0000-4000-8000-000000000001");
  expect(h.calls.at(-1)?.args).toMatchObject({p_outcome:"accepted",p_provider:"<synthetic@provider>"});
  expect(JSON.stringify(h.calls)).not.toContain("delivered");
});
test("definite rate rejection retries without reporting sent",async()=>{
  const h=harness({status:429,code:"too_many_requests"});
  expect((await h.api.processEmailDelivery("receipt")).status).toBe("queued");
  expect(h.calls.at(-1)?.args.p_outcome).toBe("retry");
});
for(const networkFailure of [true,false])test(`uncertain ${networkFailure?"network":"server"} result never blindly resends`,async()=>{
  const h=harness({networkFailure,status:503});
  expect((await h.api.processEmailDelivery("receipt")).status).toBe("uncertain");
  expect(h.requests).toHaveLength(1);expect(h.calls.at(-1)?.args.p_outcome).toBe("uncertain");
});
test("lost database confirmation after acceptance cannot become false success",async()=>{
  const h=harness({receiptFailure:true});
  expect((await h.api.processEmailDelivery("receipt")).status).toBe("uncertain");
  expect(h.requests).toHaveLength(1);
});
test("existing accepted receipt does not call Brevo again",async()=>{
  const h=harness({claimed:false});
  expect(await h.api.processEmailDelivery("receipt")).toMatchObject({ok:true,detail:"already_accepted"});
  expect(h.requests).toHaveLength(0);
});
test("duplicate event keys and test addresses never become new sends",async()=>{
  const h=harness();const input={recipient:"Person@Example.com",subject:"Hello",purpose:"activity",level:"normal",payload:{htmlContent:"Example"}};
  await h.api.deliverRecordedEmail(input);await h.api.deliverRecordedEmail(input);
  const keys=h.calls.filter(row=>row.name==="enqueue_email_delivery").map(row=>row.args.p_key);
  expect(keys[0]).toBe(keys[1]);
  const before=h.requests.length;
  expect((await h.api.deliverRecordedEmail({...input,recipient:"mirror@contratacr.test"})).status).toBe("skipped");
  expect(h.requests.length).toBe(before);
});
