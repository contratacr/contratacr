import { test, expect } from "playwright/test";
import { META_MEASUREMENT_VERSION, minimalMetaPayload } from "../../src/lib/analytics/meta-minimal";
import { sendMetaConversion } from "../../src/lib/analytics/meta-delivery";
const event = {
 event_name:"Contact",event_id:"0123456789abcdef0123456789abcdef",event_time:1792500000,
 action_source:"website",event_source_url:"https://contratacr.com/isaac-sanchez?email=private@example.com",
 user_data:{fbp:"fb.1.1792500000000.123456",fbc:"fb.1.1792500000000.ad_click",client_user_agent:"Mozilla/5.0",external_id:["account-hash"],em:["email-hash"],ph:["phone-hash"],client_ip_address:"1.2.3.4",fn:"Isaac"},
 custom_data:{measurement_version:META_MEASUREMENT_VERSION,action:"service_contact",audience:"client",search_string:"private search",cedula:"208060421",message:"private conversation"},
};
test("outbound boundary strips account identity, names, contact, IP, location, free text and profile URLs",()=>{
 const payload=minimalMetaPayload(event)!;
 expect(payload.event_source_url).toBe("https://contratacr.com/");
 expect(payload.user_data).toEqual({fbp:event.user_data.fbp,fbc:event.user_data.fbc,client_user_agent:"Mozilla/5.0"});
 expect(payload.custom_data).toEqual({measurement_version:META_MEASUREMENT_VERSION,action:"service_contact",audience:"client"});
 expect(JSON.stringify(payload)).not.toMatch(/Isaac|208060421|private|account-hash|email-hash|phone-hash|1\.2\.3\.4/);
});
test("delivery sanitizes queued envelopes again instead of trusting their contents",async()=>{
 let sent:Record<string,unknown>={};
 expect(await sendMetaConversion(event,{pixelId:"1",token:"synthetic",version:"v99.0"},(async(_url,init)=>{sent=JSON.parse(String(init?.body));return Response.json({events_received:1});}) as typeof fetch)).toBe("sent");
 expect(sent.data).toEqual([minimalMetaPayload(event)]);
});
test("unknown events, missing matching IDs and pre-minimization queues cannot be delivered",()=>{
 for(const change of [{event_name:"PrivateMessage"},{custom_data:{consent_version:"2026-10-19"}},{user_data:{external_id:["account"]}},{event_id:"private@example.com"}]) expect(minimalMetaPayload({...event,...change})).toBeNull();
});
test("only constant owned paths survive; query and fragments never do",()=>{
 expect(minimalMetaPayload({...event,event_source_url:"https://contratacr.com/proyectos?q=private#secret"})?.event_source_url).toBe("https://contratacr.com/proyectos");
 expect(minimalMetaPayload({...event,event_source_url:"https://evil.example/proyectos"})?.event_source_url).toBe("https://contratacr.com/");
});

test("Search is a conversion signal without search terms or location",()=>{
 const payload = minimalMetaPayload({...event,event_name:"Search"})!;
 expect(payload.event_name).toBe("Search");
 expect(payload.custom_data).toEqual({measurement_version:META_MEASUREMENT_VERSION});
 expect(JSON.stringify(payload)).not.toMatch(/search_string|private search|cedula|message/);
});


test("a contact cannot be relabelled as a hire or delivered without its matching action", () => {
 expect(minimalMetaPayload({...event,event_name:"ServiceHireConfirmed"})).toBeNull();
 expect(minimalMetaPayload({...event,custom_data:{measurement_version:META_MEASUREMENT_VERSION}})).toBeNull();
 const hire = minimalMetaPayload({...event,event_name:"ServiceHireConfirmed",custom_data:{measurement_version:META_MEASUREMENT_VERSION,action:"service_hire_confirmed"}})!;
 expect(hire.event_name).toBe("ServiceHireConfirmed");
 expect(hire.custom_data).toEqual({measurement_version:META_MEASUREMENT_VERSION,action:"service_hire_confirmed",audience:"client"});
});
