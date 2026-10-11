import { expect, test } from "playwright/test";
import { lifecycleCandidate, type LifecycleAccount, type LifecycleProfessional } from "../../src/lib/email/lifecycle-policy";
import { REVIEW_CAMPAIGN, SERVICES_CAMPAIGN, type CampaignHistory } from "../../src/lib/email/campaign-policy";
import { POST } from "../../src/app/api/internal/campaigns/route";
const now = Date.UTC(2026,9,11,15);
const days = (n:number) => new Date(now-n*86400000).toISOString();
const account:LifecycleAccount = {id:"account",email:"pro@example.com",full_name:"Pro",created_at:days(30),is_disabled:false,role:"client",is_provider:false};
const pro:LifecycleProfessional = {profile_id:"account",created_at:days(30),review_count:0,services:[],is_banned:false,oculto_del_buscador:false,slug:"pro"};
const receipt = (campana:string,age=15,status:CampaignHistory["status"]="sent"):CampaignHistory => ({email:account.email!,campana,enviado_en:days(age),status});
function candidate(p:LifecycleProfessional|undefined=pro,history:CampaignHistory[]=[],a=account,hasProject=false) {
  return lifecycleCandidate(a,p,history,[],hasProject,now,true)?.key;
}
test("reviews wait seven days after the newer account/profile creation",() => {
  expect(candidate({...pro,created_at:days(6)})).toBeUndefined();
  expect(candidate({...pro,created_at:days(7)})).toBe(REVIEW_CAMPAIGN.key);
});
test("professionals never receive client campaigns, even when provider capability is stale",() => {
  expect(candidate({...pro,review_count:2,services:[{priceAmount:1000}]})).toBeUndefined();
  expect(lifecycleCandidate({...account,is_provider:true},undefined,[],[],false,now,true)).toBeNull();
});
test("price follows reviews, waits fourteen days, and requires a missing real price",() => {
  expect(candidate(pro,[receipt(REVIEW_CAMPAIGN.key,13)])).toBeUndefined();
  expect(candidate(pro,[receipt(REVIEW_CAMPAIGN.key,14)])).toBe("precio-desde-profesionales-2026");
  expect(candidate({...pro,services:[{priceAmount:1500}]},[receipt(REVIEW_CAMPAIGN.key)])).toBeUndefined();
});
test("uncertain sends, bounces, unsubscribe and prior receipts fail closed",() => {
  expect(candidate(pro,[receipt("another",30,"uncertain")])).toBeUndefined();
  expect(candidate(pro,[{...receipt("another",30),rebote_en:days(29)}])).toBeUndefined();
  expect(lifecycleCandidate(account,pro,[],[account.email!],false,now,true)).toBeNull();
  expect(candidate(pro,[receipt(REVIEW_CAMPAIGN.key),receipt("precio-desde-profesionales-2026")])).toBeUndefined();
});
test("client search precedes projects, existing projects suppress the second message",() => {
  expect(lifecycleCandidate(account,undefined,[],[],false,now,true)?.key).toBe("buscar-profesionales-clientes-2026");
  const history=[receipt("buscar-profesionales-clientes-2026")];
  expect(lifecycleCandidate(account,undefined,history,[],false,now,true)?.key).toBe("crear-proyecto-clientes-2026");
  expect(lifecycleCandidate(account,undefined,history,[],true,now,true)).toBeNull();
});
test("legacy service campaigns prevent repeating the search email",() => {
  expect(lifecycleCandidate(account,undefined,[receipt(SERVICES_CAMPAIGN.key)],[],false,now,true)?.key).toBe("crear-proyecto-clientes-2026");
});
test("email changes preserve account receipts and cooldown",() => {
  const history=[{...receipt(REVIEW_CAMPAIGN.key,5),profile_id:account.id,email:"old@example.com"}];
  expect(candidate(pro,history)).toBeUndefined();
});
test("unapproved copy remains inactive",() => {
  expect(lifecycleCandidate(account,undefined,[],[],false,now)).toBeNull();
});
test("the worker rejects unauthenticated requests before accessing recipients",async () => {
  const result=await POST(new Request("https://contratacr.com/api/internal/campaigns",{method:"POST"}));
  expect([401,503]).toContain(result.status);
});
