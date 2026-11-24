import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local} from './pro-round2-fixture';
import {applySiteTemplate,filterSiteTemplates,siteTemplates,siteTemplateFilters} from '../../src/lib/pro/site-templates';
import {siteContentSchema,type SiteContent} from '../../src/lib/pro/site';

// Area E: website template gallery. The pure rules run offline; the UI part runs on the local Pro server.
const content=():SiteContent=>({title:'Obras',description:'Descripcion',language:'es',sections:[
 {type:'hero',enabled:true,heading:'Mi portada',subheading:'',cta:'Pedir'},{type:'services',enabled:true,heading:'Servicios',items:[{name:'Pintura',description:''}]},
 {type:'portfolio',enabled:true,heading:'Casos de éxito',photos:[]},{type:'reviews',enabled:true,heading:'Reseñas',max:3},{type:'area',enabled:true,heading:'Zona',text:'Heredia'},{type:'contact',enabled:true,heading:'Contacto',text:''}]});
test('Site templates: apply keeps the texts and changes order and visibility',()=>{
 expect(siteTemplates.length).toBeGreaterThanOrEqual(12);expect(new Set(siteTemplates.map(x=>x.id)).size).toBe(siteTemplates.length);
 for(const tpl of siteTemplates){const out=applySiteTemplate(content(),tpl);expect(siteContentSchema.safeParse(out).success,tpl.id).toBe(true);expect(out.sections[0]!.type).toBe('hero');
  expect(out.sections.find(s=>s.type==='hero')).toMatchObject({heading:'Mi portada'});expect(out.sections.find(s=>s.type==='services')).toMatchObject({items:[{name:'Pintura',description:''}]});
  for(const type of tpl.hidden)expect(out.sections.find(s=>s.type===type)!.enabled).toBe(false);}
 expect(filterSiteTemplates(siteTemplates,[]).length).toBe(siteTemplates.length);
 for(const f of siteTemplateFilters)expect(filterSiteTemplates(siteTemplates,[f]).length,f).toBeGreaterThan(0);
 expect(filterSiteTemplates(siteTemplates,['premium','few_content'])).toEqual([]);
});
for(const language of ['es','en'] as const)test(`Site template gallery [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',f=await ownerFixture(page.context(),language+randomBytes(3).toString('hex'));
 try{
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'sitio'}));
  const gallery=page.locator('[data-site-templates]');await expect(gallery).toBeVisible({timeout:90000});
  await expect(gallery.locator('[data-site-template]').first()).toBeVisible();
  const total=await gallery.locator('[data-site-template]').count();expect(total).toBeGreaterThanOrEqual(12);
  await gallery.locator('[data-site-template-filter="premium"]').click();await gallery.locator('[data-site-template-filter="few_content"]').click();
  await expect(gallery.locator('[data-site-template-empty]')).toBeVisible();
  await gallery.locator('[data-site-template-filter="few_content"]').click();await gallery.locator('[data-site-template-filter="premium"]').click();
  await expect(gallery.locator('[data-site-template]')).toHaveCount(total);
  await gallery.locator('[data-site-template="plano"] [data-site-template-preview]').click();await expect(page.locator('[data-site-template-frame]')).toBeVisible();await page.keyboard.press('Escape');
  await gallery.locator('[data-site-template="plano"] [data-site-template-apply]').click();
  await expect(page.locator('[data-site-notice]')).toContainText(en?'Template applied':'Plantilla aplicada');
  await expect(page.locator('[data-site-enable="portfolio"]')).not.toBeChecked();await expect(page.locator('[data-site-field="theme"]')).toHaveValue('cielo');
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
