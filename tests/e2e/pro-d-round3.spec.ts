import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';
import {parseQuoteFile,parseImportNumber} from '../../src/lib/pro/quote-file-import';

// Area D round 3: vendor tags, sortable price book, quote "Create with AI" and "Import from file". Disposable accounts, loopback only.
test('quote file import reads CSV, TSV and semicolon files with Costa Rica numbers',()=>{
 const csv=parseQuoteFile('Descripción,Cantidad,Precio unitario\n"Cemento, saco",10,"₡5.500"\nPintura interior,2,25000\n,3,100\nMala,0,10\nLámpara,10000,10');
 expect(csv.rows).toEqual([{description:'Cemento, saco',quantity:'10',unit_price:'5500'},{description:'Pintura interior',quantity:'2',unit_price:'25000'}]);
 expect(csv.skipped).toBe(3);
 expect(parseQuoteFile('item;qty;price\nPuerta;1;120,000.50').rows).toEqual([{description:'Puerta',quantity:'1',unit_price:'120001'}]);
 expect(parseQuoteFile('Ventana\t2\t45 000').rows).toEqual([{description:'Ventana',quantity:'2',unit_price:'45000'}]);
 expect(parseQuoteFile('Solo descripción').rows).toEqual([{description:'Solo descripción',quantity:'1',unit_price:'0'}]);
 expect(parseQuoteFile('').rows).toEqual([]);
 const many=parseQuoteFile(Array.from({length:25},(_,i)=>`Línea ${i},1,100`).join('\n'));
 expect(many.rows).toHaveLength(20);expect(many.truncated).toBe(true);
 expect(parseImportNumber('abc')).toBeNaN();expect(parseImportNumber('1.234,5')).toBe(1234.5);expect(parseImportNumber('12,5')).toBe(12.5);expect(parseImportNumber('1,234')).toBe(1234);
});

for(const language of ['es','en'] as const)test(`Vendor tags and sortable price book [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  await warmLocalRoutes(page,['/api/pro/company-vendors?view=list']);
  const create=(name:string,trade:string)=>page.request.post(origin+'/api/pro/company-vendors',{headers:headersFor(f.owner),data:{action:'create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),name,kind:'supplier',trade,contactName:null,email:'',phone:'',identification:'',notes:null}});
  expect((await create('Ferretería Norte '+id,'Pintura, Ferretería')).status()).toBe(200);
  expect((await create('Electro Sur '+id,'Electricidad')).status()).toBe(200);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'proveedores'}));
  const filter=page.locator('[data-vendor-tag-filter]');await expect(filter).toBeVisible({timeout:90000});
  for(const tag of ['Pintura','Ferretería','Electricidad'])await expect(filter.getByRole('button',{name:tag,exact:true})).toBeVisible();
  await filter.getByRole('button',{name:'Pintura',exact:true}).click();
  const visible=page.locator('[data-company-vendor]:visible');await expect(visible).toHaveCount(1);await expect(visible.first()).toContainText('Ferretería Norte');
  await expect(visible.first().locator('[data-vendor-tag]')).toHaveCount(2);
  await filter.getByRole('button',{name:tr('Todas','All'),exact:true}).click();await expect(visible).toHaveCount(2);
  await expectNoHorizontalOverflow(page);
  for(const [sku,name,price,stock] of [['S1','Cemento '+id,30000,5],['S2','Arena '+id,12000,50],['S3','Varilla '+id,45000,9]] as const)
   await f.db.from('pro_products').insert({user_id:f.owner.id,id:'sort-'+sku+'-'+id,sku:sku+'-'+id,name,stock,minimum:0,cost:price/2,price,archived:false,itemType:'product'}).throwOnError();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_inventory`);
  const sort=page.locator('[data-catalog-sort]');await expect(sort).toBeVisible({timeout:90000});
  const cards=page.locator('[data-pro-record-card]');await expect(cards).toHaveCount(3,{timeout:60000});
  await sort.getByLabel(tr('Ordenar por','Sort by')).selectOption('price');
  await expect(cards.nth(0)).toContainText('Arena');await expect(cards.nth(2)).toContainText('Varilla');
  await sort.locator('[data-catalog-sort-dir]').click();
  await expect(cards.nth(0)).toContainText('Varilla');await expect(cards.nth(2)).toContainText('Arena');
  await sort.getByLabel(tr('Ordenar por','Sort by')).selectOption('name');await sort.locator('[data-catalog-sort-dir]').click();
  await expect(cards.nth(0)).toContainText('Arena');
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Quote from a file and the AI starter [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  const bar=page.locator('[data-quote-start-options]');await expect(bar).toBeVisible({timeout:90000});
  await expect(bar.getByRole('button',{name:tr('Crear con IA','Create with AI')})).toBeVisible();
  await bar.locator('[data-quote-import-file]').setInputFiles({name:'Cocina '+id+'.csv',mimeType:'text/csv',buffer:Buffer.from('Descripción,Cantidad,Precio\nGabinetes,3,150000\nMesa de granito,1,"₡320.000"\n')});
  const editor=page.getByRole('dialog').last();
  await expect(editor.locator('[data-private-estimate-line]')).toHaveCount(2,{timeout:90000});
  await expect(editor.getByLabel(tr('Servicio o título','Service or title'))).toHaveValue('Cocina '+id);
  await expect(editor).toContainText('Gabinetes');
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  await bar.locator('[data-quote-import-file]').setInputFiles({name:'vacio.csv',mimeType:'text/csv',buffer:Buffer.from('\n\n')});
  await expect(page.locator('[data-quote-start-error]')).toBeVisible();
  await bar.getByRole('button',{name:tr('Crear con IA','Create with AI')}).click();
  const ai=page.locator('[data-quote-ai]');await expect(ai).toBeVisible();
  await expect(page.locator('[data-quote-ai-continue]')).toBeDisabled();
  await ai.locator('[data-quote-ai-title]').fill('Baño '+id);await ai.locator('[data-quote-ai-scope]').fill('Incluye mano de obra');
  await page.locator('[data-quote-ai-continue]').click();
  const draft=page.getByRole('dialog').last();
  await expect(draft.locator('[data-private-estimate-line]')).toHaveCount(1,{timeout:90000});
  await expect(draft).toContainText('Baño '+id);
 }finally{await f.cleanup();}
});
