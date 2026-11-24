import {test,expect,type Page} from 'playwright/test';

// Directory app, WS5: "Proyectos" hub (/solicitudes, mobile) and the "Asistente" screen (/asistente). Both need the
// directory flag (DIR_ENABLED: on in development / the test preview). The assistant backend is mocked: no model, no data.
const mock=async(page:Page,body:Record<string,unknown>={answer:'Puedo ayudarle a encontrar un profesional.'})=>{
 await page.route('**/api/ai-assistant',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)}));
};
const accept=async(page:Page)=>{await page.getByRole('button',{name:/^(De acuerdo|Agree|Accept)/i}).first().click({timeout:1500}).catch(()=>{});};

test.describe('mobile 390',()=>{
 test.use({viewport:{width:390,height:844}});

 test('Proyectos hub: sections, pill collapse, start project and plan persistence',async({page})=>{
  await page.goto('/solicitudes');await accept(page);
  const hub=page.locator('[data-projects-hub]');
  await expect(hub).toBeVisible();
  await expect(hub.locator('[data-hub-title]')).toHaveText(/^Proyectos/);
  for(const h of ['Contrate a un profesional local hoy','¿Qué sigue en su lista?','Haga de su hogar su lugar feliz','Cree un refugio en su patio','Cuide sus exteriores','Renueve sus interiores','Solicitudes de la comunidad'])
   await expect(hub.getByRole('heading',{name:h})).toBeVisible();
  await expect(hub.locator('[data-hub-oficios] li')).toHaveCount(8);
  await expect(hub.locator('[data-hub-oficios] a[href$="/categorias"]')).toBeVisible();
  await expect(hub.locator('[data-hub-iniciar]').first()).toHaveAttribute('href',/\/publicar-solicitud\?categoria=limpieza$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  // Floating pill collapses to the round button on scroll and still leads to the assistant.
  const pill=hub.locator('[data-hub-pill]');
  await expect(pill).toContainText('Obtenga ayuda con el Asistente');
  await expect(pill).toHaveAttribute('href',/\/asistente$/);
  await expect.poll(async()=>{await page.evaluate(()=>window.scrollTo(0,400));return (await pill.boundingBox())?.width??999;},{timeout:15000}).toBeLessThan(70);
  // Add to plan persists across a reload.
  const add=hub.locator('[data-hub-agregar]').first();
  await add.scrollIntoViewIfNeeded();
  await add.click();await expect(add).toHaveAttribute('aria-pressed','true');
  await page.reload();
  await expect(hub.locator('[data-hub-agregar]').first()).toHaveAttribute('aria-pressed','true');
  // "..." menu.
  await page.evaluate(()=>window.scrollTo(0,0));
  await hub.locator('[data-hub-menu]').click();
  await expect(page.getByRole('menuitem',{name:'Publicar solicitud'})).toHaveAttribute('href',/\/publicar-solicitud$/);
  await expect(page.getByRole('menuitem',{name:'Ayuda'})).toHaveAttribute('href',/\/ayuda$/);
 });

 test('Proyectos hub in English and community board still reachable',async({page})=>{
  await page.goto('/en/solicitudes');await accept(page);
  const hub=page.locator('[data-projects-hub]');
  await expect(hub.getByRole('heading',{name:'Hire a local pro today'})).toBeVisible();
  await expect(hub.locator('[data-hub-iniciar]').first()).toHaveText('Start project');
  await page.goto('/solicitudes?vista=comunidad');
  await expect(page.locator('[data-projects-hub]')).toHaveCount(0);
 });

 test('Asistente: anonymous, greeting, prompt cards, chips, reply',async({page})=>{
  await mock(page);
  await page.goto('/asistente');await accept(page);
  const s=page.locator('[data-assistant-screen]');
  await expect(s.locator('[data-assistant-greeting]')).toHaveText('¿En qué le puedo ayudar?');
  await expect(s.locator('[data-assistant-cards] li')).toHaveCount(3);
  await expect(s.getByText('FUERA DEL MAPA')).toBeVisible();
  for(const c of ['Mejores opciones','Ahora mismo','Planes de fin de semana'])await expect(s.getByRole('tab',{name:c})).toBeVisible();
  await s.getByRole('tab',{name:'Ahora mismo'}).click();
  await expect(s.getByText('URGENTE')).toBeVisible();
  const input=s.getByPlaceholder('Pregunte lo que quiera...');
  await input.fill('Necesito un electricista');await input.press('Enter');
  await expect(s.getByText('Puedo ayudarle a encontrar un profesional.')).toBeVisible();
  // History panel keeps the conversation locally.
  await s.locator('[data-assistant-history]').click();
  await expect(s.locator('[data-assistant-panel]').getByText('Necesito un electricista')).toBeVisible();
 });

 test('Asistente ?q= auto-sends and offers Solicitar cotización',async({page})=>{
  await mock(page);
  await page.goto('/asistente?q=necesito%20un%20plomero&cat=plomeria');await accept(page);
  const s=page.locator('[data-assistant-screen]');
  await expect(s.getByText('necesito un plomero')).toBeVisible();
  await expect(s.getByText('Puedo ayudarle a encontrar un profesional.')).toBeVisible();
  await expect(s.locator('[data-assistant-quote]')).toHaveText('Solicitar cotización');
  await s.locator('[data-assistant-quote]').click();
  await expect(page).toHaveURL(/\/publicar-solicitud\?categoria=plomeria/);
 });

 test('Asistente in English',async({page})=>{
  await page.goto('/en/asistente');await accept(page);
  const s=page.locator('[data-assistant-screen]');
  await expect(s.getByPlaceholder('Ask anything...')).toBeVisible();
  await expect(s.getByRole('tab',{name:'Best bets'})).toBeVisible();
 });
});

test.describe('desktop 1280',()=>{
 test.use({viewport:{width:1280,height:900}});

 test('/solicitudes keeps the board and /asistente is a centered column',async({page})=>{
  await mock(page);
  await page.goto('/solicitudes');await accept(page);
  await expect(page.getByRole('heading',{name:'Solicitudes',exact:true}).first()).toBeVisible();
  await expect(page.locator('[data-projects-hub]')).toBeHidden();
  await page.goto('/asistente');
  const s=page.locator('[data-assistant-screen]');
  const box=await s.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(721);
  await expect(s.getByPlaceholder('Pregunte lo que quiera...')).toBeVisible();
 });
});
