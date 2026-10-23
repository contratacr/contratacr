import { test, expect } from "playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contactSegment, summarizeContacts, type ContactEvent } from "../../src/lib/analytics/contact-segments";
import { AdminContactBreakdown } from "../../src/components/admin/admin-contact-breakdown";

const row = (overrides: Partial<ContactEvent> = {}): ContactEvent => ({event_type:"whatsapp_click",source:"search",created_at:new Date().toISOString(),professional_id:"provider",visitor_hash:"visitor",...overrides});
test("job markers override service sources and recipient roles never imply hiring", () => {
  expect(contactSegment(row({source:"profile",metadata:{jobId:"job"}}))).toBe("jobs");
  expect(contactSegment(row({source:"search",metadata:{intent:"job"}}))).toBe("jobs");
  expect(contactSegment(row({source:"jobs"}))).toBe("jobs");
  expect(contactSegment(row({source:"project"}))).toBe("projects");
  expect(contactSegment(row({source:"profile"}))).toBe("services");
});
test("products, packages and historical promotions without a service type are not service demand", () => {
  for (const offer_type of [undefined,"product","package"]) expect(contactSegment(row({source:"offers",metadata:{offer_type}}))).toBe("unknown");
  expect(contactSegment(row({source:"offers",metadata:{offer_type:"service_offer"}}))).toBe("services");
  expect(contactSegment(row({source:"unknown"}))).toBe("unknown");
});
test("repeated clicks do not inflate unique account-recipient pairs or count messages as new contacts", () => {
  const rows=[row(),row({event_type:"phone_click"}),row({source:"jobs"}),row({event_type:"internal_message_sent"}),row({professional_id:"other"}),row({viewer_user_id:"account",visitor_hash:"device1"}),row({viewer_user_id:"account",visitor_hash:"device2"}),row({visitor_hash:null,professional_id:null})];
  const counts=summarizeContacts(rows);
  expect(counts.services).toEqual({clicks:6,uniquePairs:3,recipients:2});
  expect(counts.jobs).toEqual({clicks:1,uniquePairs:1,recipients:1});
});
test("the panel separates jobs and services and never reports an unavailable hiring count as zero",async({page})=>{
  const last7=summarizeContacts([row(),row({source:"jobs"}),row({source:"jobs"})]);
  const last30=summarizeContacts([row(),row(),row({source:"jobs"}),row({source:"unknown"})]);
  await page.setContent(renderToStaticMarkup(createElement(AdminContactBreakdown,{data:{last7,last30,declaredHires7:null,declaredHires30:null}})));
  await expect(page.locator('[data-contact-segment="services"]')).toHaveText(/Servicios\s*1\s*2\s*1/);
  await expect(page.locator('[data-contact-segment="jobs"]')).toHaveText(/Empleos\s*2\s*1\s*1/);
  await expect(page.getByTestId('admin-declared-hires')).toHaveText('No disponible');
  await expect(page.getByText(/No verifica pago ni finalización/)).toBeVisible();
});

test("contacts towards projects remain a separate activity, not service acquisition",()=>{
  const counts=summarizeContacts([row({event_type:'project_lead_whatsapp',source:'project'}),row({event_type:'project_lead_phone',source:'project'})]);
  expect(counts.projects.clicks).toBe(2);expect(counts.services.clicks).toBe(0);
});
