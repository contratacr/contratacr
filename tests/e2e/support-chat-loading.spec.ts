import { test, expect } from "playwright/test";
import { randomUUID } from "node:crypto";
import { loginAs, gotoOK, expectNoHorizontalOverflow } from "./helpers";
import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { localizedNotificationCopy } from "../../src/lib/localized-notification";
import { compactPushText } from "../../src/lib/push/payload";
import { straightDoubleQuotes } from "../../src/lib/display-quotes";

test("historical quotes display as straight double quotes without changing interpolation",()=>{
  expect(compactPushText("Aviso: «Servicio»", 100)).toBe('Aviso: "Servicio"');
  expect(straightDoubleQuotes("<<Servicio>>")).toBe('"Servicio"');
  expect(straightDoubleQuotes('«Servicio» y “otro” {service}')).toBe('"Servicio" y "otro" {service}');
  expect(localizedNotificationCopy({type:"legacy",title:'«Aviso»',message:'Elegí “Servicio”.'},"es")).toEqual({title:'"Aviso"',message:'Elegí "Servicio".'});
});

test("support notification opens a chat-shaped loader, then the actual conversation",async({page})=>{
  test.skip(!canRunSeededRegression(),"Requires isolated database"); test.slow();
  const db=regressionAdminClient();const account=await createDisposableAccount({prefix:"chat-loading",professional:true});
  const id=randomUUID();let release:()=>void=()=>{};const ready=new Promise<void>(resolve=>{release=resolve;});
  try{
    const subject=`Caso prueba ${id.slice(0,8)}`;
    await db.from("support_tickets").insert({id,user_id:account.id,name:"Prueba",email:account.email,subject,message:'Revisamos «Servicio».',status:"in_progress",topic:"service_suggestion",last_reply_role:"admin"}).throwOnError();
    await db.from("support_ticket_messages").insert({ticket_id:id,sender_role:"admin",body:'Revisamos «Servicio».',sender_name:"Soporte"}).throwOnError();
    await db.from("notifications").insert({user_id:account.id,type:"support_reply",title:"Respuesta de soporte",message:subject,data:{ticketId:id,ticket_subject:subject,link:`/dashboard/profesional?tab=soporte&ticket=${id}`}}).throwOnError();
    await loginAs(page,account.email,account.password);
    await gotoOK(page,"/dashboard/profesional?tab=notifications");
    await page.route(`**/api/support?id=${id}`,async route=>{await ready;await route.continue();});
    await page.getByRole("button").filter({hasText:subject}).first().click();
    const loading=page.getByTestId("support-thread-skeleton");
    await expect(loading).toBeVisible();await expect(loading).toHaveAttribute("aria-busy","true");
    await expect(loading.getByTestId("support-message-skeleton")).toBeVisible();
    await expect(page.locator(".ccr-support-thread")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({path:test.info().outputPath("support-loading.png"),fullPage:true});
    release();
    await expect(loading).toHaveCount(0);
    await expect(page.getByText('Revisamos "Servicio".',{exact:true})).toBeVisible();
    await expect(page.locator(".ccr-support-thread")).not.toContainText(/[«»“”]/);
    await page.getByRole("button",{name:"Volver a mis casos",exact:true}).click();
    await expect(page).not.toHaveURL(/ticket=/);
    await expect(page.locator(".ccr-support-thread")).toHaveCount(0);
    await gotoOK(page,`/dashboard/profesional?tab=soporte&ticket=${id}`);
    await expect(page.getByText('Revisamos "Servicio".',{exact:true})).toBeVisible();
  }finally{release();await page.unrouteAll({behavior:"wait"});await db.from("support_tickets").delete().eq("id",id);await cleanupDisposableAccount(account);}
});
