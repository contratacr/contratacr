import {test,expect} from 'playwright/test';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {origin,docx,DOCX,proOwner} from './pro-file-ops-harness';
import {CSV_PREVIEW_MAX_COLS,CSV_PREVIEW_MAX_ROWS,TEXT_PREVIEW_MAX_BYTES,decodeTextPreview,detectDelimiter,formatDuration,parseCsvPreview} from '../../src/lib/pro/text-preview';
import {ConvertError,isOfficeMime,officeConverter,serviceConverter,simulatedPdf} from '../../src/lib/pro/file-convert';
import {PRO_FILE_MAX_BYTES} from '../../src/lib/pro/file-limit';
import {WORK_FILE_MAX_BYTES} from '../../src/lib/pro/work-files';
import {proDocPreview} from '../../src/lib/pro/file-formats';

// Row 28: kind icons, CSV/TXT text preview, video duration and poster, one size limit constant, and the Office to PDF adapter.
// Honest scope: the converter is SIMULATED (a labelled placeholder PDF) unless an external conversion service is configured; the
// service protocol is only tested here against a fake server. Video poster and duration run in the browser and are covered by
// the pure helpers here (real playback needs a real video codec, not the minimal fixture bytes).
const lib='/api/pro/company-files',work='/api/pro/work-files',convert='/api/pro/file-convert';

test('Text preview, size constant, converter adapter: pure contracts',async()=>{
 // TXT and CSV preview helpers.
 const long=Buffer.from('línea ñ\n'.repeat(20000),'utf8');const dec=decodeTextPreview(long.buffer.slice(long.byteOffset,long.byteOffset+long.byteLength) as ArrayBuffer);
 expect(dec.truncated).toBe(true);expect(Buffer.byteLength(dec.text,'utf8')).toBeLessThanOrEqual(TEXT_PREVIEW_MAX_BYTES);expect(dec.text).not.toContain('�');
 const odd=Buffer.from('a\u0000b\u0007c\r\nd','utf8');expect(decodeTextPreview(odd.buffer.slice(odd.byteOffset,odd.byteOffset+odd.byteLength) as ArrayBuffer).text).toBe('abc\nd');
 expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');expect(detectDelimiter('a\tb')).toBe('\t');expect(detectDelimiter('solo')).toBe(',');
 expect(parseCsvPreview('nombre,nota\n"Pérez, Ana","dijo ""hola"""\nLuis,3\n').rows).toEqual([['nombre','nota'],['Pérez, Ana','dijo "hola"'],['Luis','3']]);
 const wide=parseCsvPreview(Array.from({length:CSV_PREVIEW_MAX_ROWS+5},(_,i)=>Array.from({length:CSV_PREVIEW_MAX_COLS+3},(_,j)=>i+'-'+j).join(',')).join('\n'));
 expect(wide.rows).toHaveLength(CSV_PREVIEW_MAX_ROWS);expect(wide.rows[0]).toHaveLength(CSV_PREVIEW_MAX_COLS);expect([wide.truncatedRows,wide.truncatedCols]).toEqual([true,true]);
 expect(parseCsvPreview('<img src=x onerror=alert(1)>,b').rows[0][0]).toBe('<img src=x onerror=alert(1)>');
 expect([formatDuration(0),formatDuration(59.6),formatDuration(125),formatDuration(3725),formatDuration(NaN)]).toEqual(['0:00','1:00','2:05','1:02:05','']);
 expect(['text/csv','text/plain','application/pdf','video/mp4','image/jpeg'].map(proDocPreview)).toEqual(['text','text','pdf','video','image']);
 expect(proDocPreview(DOCX)).toBeNull();
 // One size limit: the constant is shared and no other Pro file module redeclares 20 MiB.
 expect(WORK_FILE_MAX_BYTES).toBe(PRO_FILE_MAX_BYTES);expect(PRO_FILE_MAX_BYTES).toBe(20*1024*1024);
 const offenders:string[]=[];const walk=(dir:string)=>{for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())walk(path);else if(/\.(ts|tsx)$/.test(name)&&!/(file-limit|delivery-photo-base64|zip-lite)\.ts$/.test(name)&&/20 ?\* ?1024 ?\* ?1024|20971520/.test(readFileSync(path,'utf8')))offenders.push(path);}};
 for(const dir of ['src/lib/pro','src/components/pro'])walk(dir);expect(offenders.filter(p=>!/floor-plans/.test(p))).toEqual([]);
 // Converter adapter: simulated by default, well formed and labelled, never silently replaced when the service is missing.
 const sim=officeConverter({});expect(sim.mode).toBe('simulated');
 const out=await sim.convert({name:'Contrato Ñandú (1).docx',mimeType:DOCX,bytes:Buffer.from('x')});const text=out.toString('latin1');
 expect(text.startsWith('%PDF-1.4')).toBe(true);expect(text).toContain('%%EOF');expect(text).toContain('VISTA SIMULADA');expect(text).toContain('NO es una conversion');expect(text).not.toContain('(1)');
 expect(simulatedPdf('x.docx',true).toString('latin1')).toContain('SIMULATED PREVIEW');
 const xref=Number(/startxref\n(\d+)\n/.exec(text)![1]);expect(text.slice(xref,xref+4)).toBe('xref');
 expect(isOfficeMime(DOCX)).toBe(true);expect(isOfficeMime('application/pdf')).toBe(false);expect(isOfficeMime('text/csv')).toBe(false);
 expect(()=>officeConverter({PRO_OFFICE_CONVERT_MODE:'service'})).toThrow(ConvertError);expect(()=>officeConverter({PRO_OFFICE_CONVERT_MODE:'service',PRO_OFFICE_CONVERT_URL:'ftp://x'})).toThrow(/not_configured/);
 // Service mode against a fake Gotenberg: protocol, token, PDF check, failures.
 let seen:{url:string;auth:string|null}|null=null;
 const fake=(body:BodyInit|null,status=200)=>{const f:typeof fetch=async(input,init)=>{seen={url:String(input),auth:new Headers(init?.headers).get('authorization')};return new Response(body,{status});};return f;};
 const env={PRO_OFFICE_CONVERT_URL:'https://convert.example/',PRO_OFFICE_CONVERT_TOKEN:'tok'};
 const ok=serviceConverter(env,fake('%PDF-1.7\nreal\n%%EOF\n'));expect(ok.mode).toBe('service');
 expect((await ok.convert({name:'a.docx',mimeType:DOCX,bytes:Buffer.from('x')})).subarray(0,5).toString('latin1')).toBe('%PDF-');expect(seen).toEqual({url:'https://convert.example/forms/libreoffice/convert',auth:'Bearer tok'});
 await expect(serviceConverter(env,fake('<html>',200)).convert({name:'a.docx',mimeType:DOCX,bytes:Buffer.from('x')})).rejects.toMatchObject({code:'invalid'});
 await expect(serviceConverter(env,fake('x',500)).convert({name:'a.docx',mimeType:DOCX,bytes:Buffer.from('x')})).rejects.toMatchObject({code:'unavailable'});
 await expect(serviceConverter(env,fake('')).convert({name:'a.docx',mimeType:DOCX,bytes:Buffer.from('x')})).rejects.toMatchObject({code:'size'});
 await expect(ok.convert({name:'a.pdf',mimeType:'application/pdf',bytes:Buffer.from('x')})).rejects.toMatchObject({code:'invalid'});
});

for(const language of ['es','en'] as const)test(`Icons, CSV/TXT preview and Office to PDF (simulated) [${language}]`,async({page,baseURL})=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',errors=collectPageErrors(page);
 const h=await proOwner(page,'ffp');const {db,owner,workId,headers,post}=h;
 try{
  const word=crypto.randomUUID(),csv=crypto.randomUUID(),txt=crypto.randomUUID(),doc=crypto.randomUUID();
  await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:word,folderId:null,name:'contrato.docx',data:docx().toString('base64')});
  await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:csv,folderId:null,name:'precios.csv',data:Buffer.from('material,precio\n"Cemento, gris",5500\nArena,3200\n','utf8').toString('base64')});
  await post(lib,{action:'upload',actionId:crypto.randomUUID(),fileId:txt,folderId:null,name:'notas.txt',data:Buffer.from('Primera línea\nSegunda línea <b>no es html</b>\n','utf8').toString('base64')});
  await post(work,{action:'upload',workId,fileId:doc,name:'orden.docx',data:docx().toString('base64')});

  // ---- API: convert (company and job), idempotent, receipts, validation ----
  const action=crypto.randomUUID(),target=crypto.randomUUID();
  const done=await post(convert,{action:'convert',scope:'company',actionId:action,fileId:word,targetFileId:target});
  expect(done).toMatchObject({mode:'simulated',simulated:true,replayed:false,fileId:target});expect(done.name).toBe('contrato (vista simulada).pdf');
  const row=(await db.from('pro_company_files').select('mime_type,name,ready').eq('owner_id',owner.id).eq('id',target).single().throwOnError()).data!;expect(row).toEqual({mime_type:'application/pdf',name:'contrato (vista simulada).pdf',ready:true});
  expect((await post(convert,{action:'convert',scope:'company',actionId:action,fileId:word,targetFileId:target})).replayed).toBe(true);
  expect((await db.from('pro_company_files').select('id').eq('owner_id',owner.id).eq('mime_type','application/pdf').throwOnError()).data).toHaveLength(1);
  const wdone=await post(convert,{action:'convert',scope:'work',workId,actionId:crypto.randomUUID(),fileId:doc,targetFileId:crypto.randomUUID()});expect(wdone.simulated).toBe(true);
  expect((await db.from('pro_file_transfers').select('kind,mode,status').eq('owner_id',owner.id).eq('kind','convert').throwOnError()).data).toEqual([{kind:'convert',mode:'simulated',status:'done'},{kind:'convert',mode:'simulated',status:'done'}]);
  await post(convert,{action:'convert',scope:'company',actionId:crypto.randomUUID(),fileId:csv,targetFileId:crypto.randomUUID()},400);
  await post(convert,{action:'convert',scope:'company',actionId:crypto.randomUUID(),fileId:crypto.randomUUID(),targetFileId:crypto.randomUUID()},404);
  await post(convert,{action:'convert',scope:'company',actionId:crypto.randomUUID(),fileId:word,targetFileId:crypto.randomUUID(),extra:1},400);
  expect((await page.request.post(convert,{headers:{...headers,Origin:'http://evil.example'},data:{action:'convert',scope:'company',actionId:crypto.randomUUID(),fileId:word,targetFileId:crypto.randomUUID()}})).status()).toBe(403);

  // ---- UI: icons per kind, text preview, convert button with the honest notice ----
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_files`);const library=page.locator('[data-company-files]');
  const card=(id:string)=>library.locator(`[data-company-file="${id}"]`);await expect(card(word)).toBeVisible({timeout:60000});
  await expect(card(word).locator('[data-file-type-icon="word"]')).toBeVisible();await expect(card(csv).locator('[data-file-type-icon="sheet"]')).toBeVisible();await expect(card(txt).locator('[data-file-type-icon="text"]')).toBeVisible();await expect(card(target).locator('[data-file-type-icon="pdf"]')).toBeVisible();
  await card(csv).getByRole('button',{name:en?'View':'Ver',exact:true}).click();
  const grid=page.locator('[data-pro-text-preview="csv"]');await expect(grid).toBeVisible({timeout:60000});await expect(grid).toContainText('Cemento, gris');await expect(grid.locator('tr')).toHaveCount(3);
  await page.getByRole('button',{name:en?'Close preview':'Cerrar vista previa'}).click();
  await card(txt).getByRole('button',{name:en?'View':'Ver',exact:true}).click();
  const plain=page.locator('[data-pro-text-preview="txt"]');await expect(plain).toContainText('Segunda línea <b>no es html</b>',{timeout:60000});await expect(plain.locator('b')).toHaveCount(0);
  await page.getByRole('button',{name:en?'Close preview':'Cerrar vista previa'}).click();
  await expect(card(word).locator('[data-convert-pdf]')).toBeVisible();await expect(card(csv).locator('[data-convert-pdf]')).toHaveCount(0);
  await card(word).locator('[data-convert-pdf]').click();
  await expect(card(word).locator('[data-convert-notice]')).toContainText(en?'It is a simulated preview':'Es una vista simulada',{timeout:60000});
  await expectNoHorizontalOverflow(page);expect(errors()).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await h.cleanup();}
});
