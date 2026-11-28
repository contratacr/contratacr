import {test,expect} from 'playwright/test';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {gotoOK} from './helpers';
import {local,ownerFixture} from './pro-round2-fixture';

// Row 15: the owner's global task center exports the SELECTED tasks to CSV (";", BOM, formulas neutralised) and to
// Excel (XLSX, inline strings: a formula is never evaluated) with the headers of the interface language.
for(const language of ['es','en'] as const)test(`Task center export: selected tasks to CSV and Excel [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag);
 try{
  const a=crypto.randomUUID(),b=crypto.randomUUID(),skip=crypto.randomUUID();
  await f.db.from('pro_work_tasks').insert([
   {owner_id:f.owner.id,work_id:f.workId,id:a,title:'EXPORT_A '+tag,details:'',assignee:'Ana',due_date:'2030-03-11',status:'open',archived:false,revision:1},
   {owner_id:f.owner.id,work_id:f.workId,id:b,title:'=HYPERLINK("x") '+tag,details:'',assignee:'',due_date:null,status:'done',archived:false,revision:1},
   {owner_id:f.owner.id,work_id:f.workId,id:skip,title:'EXPORT_SKIPPED '+tag,details:'',assignee:'',due_date:null,status:'open',archived:false,revision:1}]).throwOnError();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tasks`);
  const center=page.locator('[data-task-center]');await expect(center).toBeVisible({timeout:90000});
  const item=(id:string)=>center.locator(`[data-task-center-item="${id}"]:visible`);
  // Show pending and completed tasks.
  await center.getByRole('group',{name:en?'Task status':'Estado de tareas'}).getByRole('button',{name:en?'All':'Todas',exact:true}).click();
  await expect(item(a)).toBeVisible({timeout:60000});await expect(item(b)).toBeVisible({timeout:60000});
  await item(a).getByRole('checkbox').check();await item(b).getByRole('checkbox').check();
  const csvDownload=page.waitForEvent('download');await center.locator('[data-task-center-csv]').click();const csv=await csvDownload;
  expect(csv.suggestedFilename()).toMatch(en?/^contratacr-tasks-\d{4}-\d{2}-\d{2}\.csv$/:/^contratacr-tareas-\d{4}-\d{2}-\d{2}\.csv$/);
  const text=await readFile((await csv.path())!,'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const lines=text.slice(1).trim().split('\r\n');
  expect(lines[0]).toBe(en?'Task;Job;Customer;Due date;Status;Assignee;Phase;Planned start;Planned end':'Tarea;Trabajo;Cliente;Fecha límite;Estado;Responsable;Fase;Inicio previsto;Fin previsto');
  expect(lines).toHaveLength(3);expect(text).not.toContain('EXPORT_SKIPPED');
  expect(lines.find(l=>l.startsWith('EXPORT_A'))).toContain(';2030-03-11;'+(en?'Pending':'Pendiente')+';Ana;');
  expect(lines.some(l=>l.startsWith(`"'=HYPERLINK(""x"") ${tag}"`))).toBe(true);// neutralised and quoted
  await expect(page.getByText(en?'CSV prepared.':'CSV preparado.')).toBeVisible();
  const xlsxDownload=page.waitForEvent('download');await center.locator('[data-task-center-xlsx]').click();const xlsx=await xlsxDownload;
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  const files=unzipSync(new Uint8Array(await readFile((await xlsx.path())!)));
  const sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
  expect(strFromU8(files['xl/workbook.xml'])).toContain(`name="${en?'Tasks':'Tareas'}"`);
  expect(sheet).toContain(en?'>Task<':'>Tarea<');expect(sheet).toContain('EXPORT_A '+tag);expect(sheet).not.toContain('EXPORT_SKIPPED');
  expect(sheet).not.toContain('<f>');expect(sheet).toContain('=HYPERLINK(&quot;x&quot;) '+tag);// stored as text, never a formula
  await expect(page.getByText(en?'Excel file prepared.':'Archivo de Excel preparado.')).toBeVisible();
 }finally{await page.goto('about:blank').catch(()=>{});await f.cleanup();}
});
