import {expect,test} from "playwright/test";
import {lifecycleCandidate,type LifecycleAccount,type LifecycleProfessional} from "../../src/lib/email/lifecycle-policy";
import {PROFILE_REMINDER,professionalProfileIncomplete} from "../../src/lib/email/profile-reminder";
import {REVIEW_CAMPAIGN,type CampaignHistory} from "../../src/lib/email/campaign-policy";
import {canRunSeededRegression,regressionAdminClient} from "./seed";
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from "./disposable-account";
import {gotoOK,loginAs,resetAuth,waitForInteractivePage} from "./helpers";
const now=Date.UTC(2026,9,11,15);
const date=(days:number)=>new Date(now-days*86400000).toISOString();
const account:LifecycleAccount={id:"profile-reminder",email:"pending@example.com",full_name:"Pending",created_at:date(3),is_disabled:false,role:"client",is_provider:false,professionalIntent:true,emailConfirmed:true,avatar_url:"https://example.com/photo.jpg"};
const complete:LifecycleProfessional={profile_id:account.id,created_at:date(3),review_count:0,services:[{active:true,description:"Servicio",priceType:"a_convenir"}],is_banned:false,oculto_del_buscador:false,slug:"complete",bio:"Trabajo profesional",whatsapp:"+50670001234",coverage_country:true,workplaces:[{provinciaId:"alajuela",cantonId:"atenas"}]};
const candidate=(a=account,p:LifecycleProfessional|undefined=undefined,h:CampaignHistory[]=[])=>lifecycleCandidate(a,p,h,[],false,now,true);
test("only confirmed professional intent qualifies for an abandoned registration",()=>{
  expect(candidate()?.key).toBe(PROFILE_REMINDER.key);
  expect(candidate({...account,professionalIntent:false})?.key).toBe("buscar-profesionales-clientes-2026");
  expect(candidate({...account,emailConfirmed:false})).toBeNull();
});
test("completion waits two full days and takes priority over old backlog",()=>{
  expect(candidate({...account,created_at:date(1)})).toBeNull();
  expect(candidate({...account,created_at:date(2)})?.key).toBe(PROFILE_REMINDER.key);
  expect(candidate({...account,created_at:date(200)}, {...complete,bio:""})?.key).toBe(PROFILE_REMINDER.key);
});
test("finishing the basics cancels the completion email; reviews and price are separate",()=>{
  expect(professionalProfileIncomplete(account,complete)).toBe(false);
  expect(candidate({...account,created_at:date(10)},{...complete,created_at:date(10)})?.key).toBe(REVIEW_CAMPAIGN.key);
});
test("sent receipts survive subject changes, and campaigns stay fourteen days apart",()=>{
  const receipt:CampaignHistory={profile_id:account.id,email:account.email!,campana:PROFILE_REMINDER.key,status:"sent",enviado_en:date(1)};
  expect(candidate(account,undefined,[receipt])).toBeNull();
  expect(candidate({...account,created_at:date(30)},undefined,[{...receipt,enviado_en:date(14)}])?.key).toBe("buscar-profesionales-clientes-2026");
  expect(candidate(account,undefined,[{...receipt,status:"sending",enviado_en:date(30)}])).toBeNull();
});
test("a recent legacy review email delays completion, rather than resetting history",()=>{
  const receipt:CampaignHistory={email:account.email!,campana:REVIEW_CAMPAIGN.key,status:"sent",enviado_en:date(1)};
  expect(candidate(account,{...complete,bio:""},[receipt])).toBeNull();
  expect(candidate(account,{...complete,bio:""},[{...receipt,enviado_en:date(14)}])?.key).toBe(PROFILE_REMINDER.key);
});
test.describe("profile email button through real login",()=>{
  test.skip(!canRunSeededRegression(),"Requires isolated synthetic Supabase fixtures");
  let disposable:DisposableAccount|undefined;
  test.afterEach(async()=>{await cleanupDisposableAccount(disposable);disposable=undefined;});
  test("logged out → login → existing account continues professional registration",async({page})=>{
    disposable=await createDisposableAccount({prefix:"profile-reminder"});
    const {error}=await regressionAdminClient().auth.admin.updateUserById(disposable.id,{user_metadata:{role:"client",intended_role:"professional",professional_signup_started:true,onboarding_completed:true}});
    if(error) throw error;
    await resetAuth(page);
    await page.goto("/continuar-perfil");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/continuar-perfil");
    await waitForInteractivePage(page);
    await page.getByLabel(/Correo|Email/i).first().fill(disposable.email);
    await page.getByLabel(/^Contraseña$|^Password$/i).fill(disposable.password);
    await page.getByRole("button",{name:/^Ingresar$|^Sign in$/i}).click();
    await expect(page).toHaveURL(/\/registro\/profesional(?:\?|$)/,{timeout:30000});
    await expect(page.getByLabel(/^Contraseña$|^Password$/i)).toHaveCount(0);
  });
  test("an authenticated professional returns directly to the completion checklist",async({page})=>{
    disposable=await createDisposableAccount({prefix:"profile-reminder-existing",professional:true,publicDiscoverable:true});
    await loginAs(page,disposable.email,disposable.password);
    await gotoOK(page,"/continuar-perfil");
    await expect(page).toHaveURL(/\/dashboard\/profesional\?mode=offer&tab=completion/,{timeout:30000});
    await expect(page.getByRole("button",{name:/^Ingresar$|^Sign in$/i})).toHaveCount(0);
  });
});
