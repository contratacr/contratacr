import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 6C (2026-11-13): meeting / call recordings linked to the job (row 76) in MOCK mode. Upload only with
// the all-parties consent confirmation, private audio (other owner 404, anonymous 401), transcript + summary +
// action items as an editable suggestion, notes saved only by the owner, action items → job tasks, delete audio.
// No real transcription or AI call (mock adapters). Loopback only.
const shots=process.env.ROUND6C_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
for(const language of ['es','en'] as const)test(`Round 6C: meeting recording → transcript, summary and tasks in mock mode [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6);
 const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const f=await ownerFixture(page.context(),label,document=>{document.work[0]={...document.work[0]!,stage:'scheduled',start:tomorrow+'T09:00:00-06:00',end:tomorrow+'T11:00:00-06:00'};});
 const other=await browser.newContext(),anon=await browser.newContext();let g:Awaited<ReturnType<typeof ownerFixture>>|null=null;
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),audio=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(8996,3)]);// WebM (EBML) header: the server checks the file's bytes
  const meetings=async()=>(await f.db.from('pro_ai_meeting_notes').select('id,summary,action_items,ai_generated,recording_id').eq('owner_id',f.owner.id)).data!;
  const upload=(consent:boolean,id=crypto.randomUUID())=>page.request.post(origin+'/api/pro/ai-meetings',{headers:h,multipart:{id,workId:f.workId,title:'API',consentAllParties:consent?'true':'false',language,file:{name:'a.webm',mimeType:'audio/webm',buffer:audio}}});
  // Company consent is OFF: even with the all-parties tick the upload is refused.
  const blocked=await upload(true);expect(blocked.status()).toBe(403);expect((await blocked.json()).reason).toBe('consent_required');
  const settings=await (await page.request.get(origin+'/api/pro/ai?settings=1')).json() as {revision:number};
  expect((await page.request.post(origin+'/api/pro/ai',{headers:h,data:{action:'set_consent',actionId:crypto.randomUUID(),revision:settings.revision,consent:true,consentVersion:'2026-11-13'}})).status()).toBe(200);
  const noConsent=await upload(false);expect(noConsent.status()).toBe(400);expect((await noConsent.json()).reason).toBe('consent_meeting');
  const wrongType=await page.request.post(origin+'/api/pro/ai-meetings',{headers:h,multipart:{id:crypto.randomUUID(),workId:f.workId,title:'X',consentAllParties:'true',language,file:{name:'a.txt',mimeType:'text/plain',buffer:Buffer.from('hola')}}});
  expect(wrongType.status()).toBe(400);
  // Post-security fixes: a declared «audio/webm» that is not audio, and an unexpected extra field, are refused.
  const spoofed=await page.request.post(origin+'/api/pro/ai-meetings',{headers:h,multipart:{id:crypto.randomUUID(),workId:f.workId,title:'X',consentAllParties:'true',language,file:{name:'a.webm',mimeType:'audio/webm',buffer:Buffer.alloc(9000,3)}}});
  expect(spoofed.status()).toBe(400);expect((await spoofed.json()).reason).toBe('unsupported_file');
  expect((await page.request.post(origin+'/api/pro/ai-meetings',{headers:h,multipart:{id:crypto.randomUUID(),workId:f.workId,title:'X',consentAllParties:'true',language,extra:'1',file:{name:'a.webm',mimeType:'audio/webm',buffer:audio}}})).status()).toBe(400);

  // (1) Job › Notes and calls: the upload needs the consent tick; the audio stays private.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'notes'}));
  const panel=page.locator('[data-work-meetings]');await expect(panel).toBeVisible({timeout:90000});
  await panel.locator('[data-meeting-title]').fill(en?'Site visit with the customer':'Visita con el cliente');
  await panel.locator('[data-meeting-file]').setInputFiles({name:'reunion.webm',mimeType:'audio/webm',buffer:audio});
  await expect(panel.locator('[data-meeting-upload-submit]')).toBeDisabled();
  await panel.locator('[data-meeting-consent]').check();await expect(panel.locator('[data-meeting-upload-submit]')).toBeEnabled();
  await panel.locator('[data-meeting-upload-submit]').click();
  const recording=panel.locator('[data-meeting-recording]');await expect(recording).toHaveCount(1,{timeout:60000});
  const recordingId=(await recording.getAttribute('data-meeting-recording'))!;
  const stored=(await f.db.from('pro_ai_recordings').select('consent_all_parties,consent_text,size_bytes').eq('owner_id',f.owner.id).single()).data!;
  expect(stored).toMatchObject({consent_all_parties:true,size_bytes:audio.length});expect(stored.consent_text).toContain(en?'everyone in the meeting':'todas las personas');
  const own=await page.request.get(origin+'/api/pro/ai-meetings?audio='+recordingId);expect(own.status()).toBe(200);expect(own.headers()['content-type']).toBe('audio/webm');expect(Buffer.from(await own.body()).equals(audio)).toBe(true);
  expect((await anon.request.get(origin+'/api/pro/ai-meetings?audio='+recordingId)).status()).toBe(401);
  g=await ownerFixture(other,label+'r');
  expect((await other.request.get(origin+'/api/pro/ai-meetings?audio='+recordingId)).status()).toBe(404);
  expect((await other.request.get(origin+'/api/pro/ai-meetings?workId='+encodeURIComponent(f.workId))).status()).toBe(404);
  expect((await other.request.post(origin+'/api/pro/ai-meetings',{headers:headersFor(g.owner),data:{action:'delete_recording',id:recordingId}})).status()).toBe(404);
  await recording.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6c-meeting-recording-${language}`,project);

  // (2) Transcribe + summarize → editable suggestion; nothing is kept until «Guardar en el trabajo».
  await recording.locator('[data-meeting-transcribe]').click();
  const editor=panel.locator('[data-meeting-editor="create"]');await expect(editor).toBeVisible({timeout:60000});
  await expect(editor.locator('[data-ai-label]')).toContainText(en?'AI-generated':'Generado con IA');
  await expect(editor.locator('[data-meeting-field="summary"]')).toHaveValue(en?/^Site meeting about Remodelación de cocina/:/^Reunión en sitio sobre Remodelación de cocina/);
  await expect(editor.locator('[data-meeting-item]')).toHaveCount(3);
  expect(await meetings()).toEqual([]);
  await editor.locator('[data-meeting-field="summary"]').fill(en?'The customer approved the tile and asked to move the outlet.':'El cliente aprobó el azulejo y pidió mover el tomacorriente.');
  await editor.locator('[data-meeting-item]').nth(2).fill(en?'Send the updated quote on Friday':'Enviar la cotización actualizada el viernes');
  await editor.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6c-meeting-suggestion-${language}`,project);
  await editor.locator('[data-meeting-save]').click();
  const note=panel.locator('[data-meeting-note]');await expect(note).toHaveCount(1,{timeout:60000});await expect(editor).toHaveCount(0);
  const saved=(await meetings())[0]!;
  expect(saved).toMatchObject({summary:en?'The customer approved the tile and asked to move the outlet.':'El cliente aprobó el azulejo y pidió mover el tomacorriente.',ai_generated:true,recording_id:recordingId});
  expect((saved.action_items as {text:string}[]).map(i=>i.text)[2]).toBe(en?'Send the updated quote on Friday':'Enviar la cotización actualizada el viernes');
  expect((await f.db.from('pro_ai_suggestions').select('feature,review,provider').eq('owner_id',f.owner.id).order('created_at')).data).toEqual([{feature:'transcribe_meeting',review:null,provider:'transcription'},{feature:'meeting',review:'used',provider:'ai'}]);
  expect((await f.db.from('pro_work_tasks').select('id').eq('owner_id',f.owner.id)).data).toEqual([]);

  // (3) An action item becomes a job task through the existing writer and stays linked.
  await note.locator('[data-meeting-action-item="open"]').first().locator('[data-meeting-create-task]').click();
  await expect(note.locator('[data-meeting-action-item="task"]')).toHaveCount(1,{timeout:60000});
  const tasks=(await f.db.from('pro_work_tasks').select('id,title,details').eq('owner_id',f.owner.id)).data!;
  expect(tasks).toHaveLength(1);expect(tasks[0]!.title).toBe(en?'Order the approved tile':'Pedir el azulejo aprobado');
  expect(((await meetings())[0]!.action_items as {taskId:string|null}[])[0]!.taskId).toBe(tasks[0]!.id);
  await note.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6c-meeting-notes-${language}`,project);
  // Stale revision is refused (CAS).
  const stale=await page.request.post(origin+'/api/pro/ai-meetings',{headers:h,data:{action:'update',actionId:crypto.randomUUID(),id:saved.id,revision:1,title:'X',transcript:'',summary:'S',actionItems:[],decisions:[]}});
  expect(stale.status()).toBe(409);

  // (4) The owner deletes the audio; the reviewed notes stay.
  await recording.locator('[data-meeting-delete]').click();
  await page.getByRole('dialog').filter({hasText:en?'Delete the recording?':'¿Borrar la grabación?'}).getByRole('button',{name:en?'Delete':'Borrar',exact:true}).click();
  await expect(panel.locator('[data-meeting-recording]')).toHaveCount(0,{timeout:60000});await expect(note).toHaveCount(1);
  expect((await page.request.get(origin+'/api/pro/ai-meetings?audio='+recordingId)).status()).toBe(404);
  expect(errors()).toEqual([]);
 }finally{await g?.cleanup();await other.close();await anon.close();await f.cleanup();}
});
