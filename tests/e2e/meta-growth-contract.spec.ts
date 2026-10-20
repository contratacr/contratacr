import { test,expect } from "playwright/test";
import { qualifiesServiceContact,usableProfessional,GROWTH_ACTIONS,META_TEST_BUDGET } from "../../src/lib/analytics/growth-contract";
import { summarizeGrowth } from "../../src/lib/analytics/growth-report";
import { sendMetaConversion } from "../../src/lib/analytics/meta-delivery";
import { eligibleProjectRecipient,matchesProjectCoverage } from "../../src/lib/projects/project-recipients";

test("service demand excludes job applications, products, self and professional-to-client contact",()=>{
 expect(qualifiesServiceContact({})).toBe(true);
 for(const context of [{jobId:"job"},{intent:"job"},{self:true},{product:true},{contactingClient:true}])expect(qualifiesServiceContact(context)).toBe(false);
 expect(GROWTH_ACTIONS.professional_project_contact.audience).toBe("professional");
 expect(GROWTH_ACTIONS.employer_job_published.audience).toBe("employer");
 expect(Object.values(GROWTH_ACTIONS).some(row=>String(row.event)==="Purchase")).toBe(false);
});
test("usable professionals need an active service, contact and coverage",()=>{
 const ready={ services:[{name:"Electricidad",active:true}],whatsapp:"88888888",provincia_id:"san-jose" };
 expect(usableProfessional(ready)).toBe(true);
 for(const patch of [{is_banned:true},{oculto_del_buscador:true},{verification_status:"rejected"},{whatsapp:""},{services:[{name:"Electricidad",active:false}]},{provincia_id:null}])expect(usableProfessional({...ready,...patch})).toBe(false);
});
test("reports separate campaigns and deduplicate people across repeated actions",()=>{
 const result=summarizeGrowth([
  {action:"service_contact",actor_hash:"a",attribution:{campaign:"clientes"},status:"sent"},
  {action:"service_contact",actor_hash:"a",attribution:{campaign:"clientes"},status:"pending"},
  {action:"employer_job_published",actor_hash:"b",attribution:{campaign:"empleos"},status:"suppressed"},
 ],21);
 expect(result.results.find(row=>row.action==="service_contact")).toMatchObject({people:1,actions:2});
 expect(result.results).toHaveLength(2);expect(result.remainingMonthlyUsd).toBe(0);expect(result.overMonthlyCeiling).toBe(true);
 expect(result.budget).toEqual({currency:"USD",total:14,days:7,monthlyCeiling:20});expect(META_TEST_BUDGET.total).toBeLessThanOrEqual(META_TEST_BUDGET.monthlyCeiling);
});
test("CAPI success requires an acknowledged event, retries preserve the event identity",async()=>{
 const requests: Record<string,unknown>[]=[];
 const payload={event_name:"Contact",event_id:"stable-id",event_time:123,custom_data:{action:"service_contact",audience:"client",consent_version:"2026-10-19"}};
 const config={pixelId:"123",token:"test-secret",version:"v99.0",testCode:"TEST"};
 const transport=(async (_url,init)=>{requests.push(JSON.parse(String(init?.body)));return Response.json({events_received:1});}) as typeof fetch;
 expect(await sendMetaConversion(payload,config,transport)).toBe("sent");
 expect(await sendMetaConversion(payload,config,transport)).toBe("sent");
 expect(requests[0]).toEqual(requests[1]);expect(requests[0]).toMatchObject({data:[payload],test_event_code:"TEST"});
 expect(JSON.stringify(requests)).not.toContain("test-secret");
 expect(await sendMetaConversion(payload,config,(async()=>Response.json({events_received:0})) as typeof fetch)).toBe("retry");
 expect(await sendMetaConversion(payload,config,(async()=>Response.json({error:"unavailable"},{status:503})) as typeof fetch)).toBe("retry");
 expect(await sendMetaConversion(payload,config,(async()=>{throw new Error("timeout");}) as typeof fetch)).toBe("retry");
});
test("project notices require active service and relevant coverage",()=>{
 const pro={profile_id:"pro",category_id:"electricidad",services:[{name:"Electricidad",category:"electricidad",active:true}],provincia_id:"sj",canton_id:"sj-central",profiles:{is_disabled:false}};
 expect(eligibleProjectRecipient(pro,"electricidad","client")).toBe(true);
 for(const patch of [{is_banned:true},{oculto_del_buscador:true},{profiles:{is_disabled:true}},{services:[{category:"electricidad",active:false}]},{profile_id:"client"}])expect(eligibleProjectRecipient({...pro,...patch},"electricidad","client")).toBe(false);
 expect(matchesProjectCoverage(pro,"sj","sj-central")).toBe(true);
 expect(matchesProjectCoverage(pro,"al","al-central")).toBe(false);
 expect(matchesProjectCoverage({...pro,coverage_country:true},"al","al-central")).toBe(true);
 expect(matchesProjectCoverage({...pro,workplaces:[{provinciaId:"al"}]},"al","al-central")).toBe(true);
 expect(matchesProjectCoverage({...pro,videoconsulta:true},"al","al-central")).toBe(false);
});

test("October's known ad spend cannot disappear because the cost ledger is incomplete",()=>{
 const october=summarizeGrowth([],0,"2026-10");
 expect(october.auditedAdsUsd).toBe(9.38);expect(october.maximumTestUsd).toBe(10.62);expect(october.spendNeedsReconciliation).toBe(true);
 expect(summarizeGrowth([],12,"2026-10").maximumTestUsd).toBe(8);
 expect(summarizeGrowth([],0,"2026-11").maximumTestUsd).toBe(14);
});

test("legacy queued conversions without affirmative consent never reach Meta", async () => {
 let calls=0;
 const result=await sendMetaConversion({}, {pixelId:"1",token:"synthetic",version:"v20.0"}, async()=>{calls++;throw Error("must not send");});
 expect(result).toBe("suppressed");expect(calls).toBe(0);
});
