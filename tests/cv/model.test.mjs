import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const code = ts.transpileModule(readFileSync('src/lib/cv/model.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { suggestCv, mergeCv, normalizeCv, emptyCv } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const sample = `María Ejemplo\ncorreo@example.test\nFormación académica\nTécnico en Administración\nInstituto de Ejemplo\n2020\n\nExperiencia laboral\nAsistente administrativa\nEmpresa de Ejemplo\n2021 - 2024\nAtención a clientes\n\nHabilidades\nExcel, Organización, Excel\nReferencias\nPersona privada\nprivate@example.test`;
test('suggests explicit sections without importing contacts/references or invented dates', () => {
 const cv = suggestCv(sample);
 assert.equal(cv.education[0].title, 'Técnico en Administración');
 assert.equal(cv.experience[0].organization, 'Empresa de Ejemplo');
 assert.deepEqual(cv.skills, ['Excel', 'Organización']);
 assert.doesNotMatch(JSON.stringify(cv), /private|correo|María/);
 assert.equal(suggestCv('Education\nCourse\nInstitute').education[0].period, '');
});
test('unknown headings are not guessed', () => assert.deepEqual(suggestCv('A person\nA company\n2020\nA school'), emptyCv()));
test('reimport preserves edits and deduplicates case and accents', () => {
 const first = normalizeCv({ ...emptyCv(), education: [{ title: 'Técnico', organization: 'INA', period: '2020', description: 'Mi descripción' }], skills: ['Excel'] });
 const next = normalizeCv({ ...first, education: [{ ...first.education[0], title: 'TECNICO', description: 'Otra' }], skills: ['excel'] });
 const merged = mergeCv(first, next);
 assert.equal(merged.education.length, 1); assert.equal(merged.education[0].description, 'Mi descripción'); assert.deepEqual(merged.skills, ['Excel']);
});
test('malformed values and oversized entries are bounded and stripped of unknown fields', () => {
 assert.deepEqual(normalizeCv({ education: [null, 2, {}], skills: [null, {}, ''] }), emptyCv());
 const cv = normalizeCv({ ...emptyCv(), skills: Array.from({length: 50}, (_, i) => `${i}`), secret: 'never' });
 assert.equal(cv.skills.length, 40); assert.equal(cv.secret, undefined);
});
test('migration enforces schema and preserves owner-only writes', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$; CREATE ROLE cv_user; CREATE TABLE public.professionals(id uuid PRIMARY KEY, profile_id uuid NOT NULL); ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY; CREATE POLICY own_update ON public.professionals FOR UPDATE USING(auth.uid()=profile_id); CREATE POLICY public_read ON public.professionals FOR SELECT USING(true); GRANT USAGE ON SCHEMA auth TO cv_user; GRANT SELECT, UPDATE ON public.professionals TO cv_user; INSERT INTO public.professionals VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');`);
  const migration = readFileSync('supabase/migrations/262_cv_perfil_publico.sql','utf8');
  await db.exec(migration); await db.exec(migration);
  for(const bad of [{ education: [], experience: [], skills: [], rawCv: 'secret' }, {education: [], experience:[],skills:[null]}, {education:[{title:'',organization:'',period:'',description:''}],experience:[],skills:[]}]) {
   await assert.rejects(db.query('UPDATE professionals SET cv_profile=$1', [bad]));
  }
  await db.exec("SET ROLE cv_user; SELECT set_config('app.uid','00000000-0000-4000-8000-000000000003',false);");
  assert.equal((await db.query('UPDATE professionals SET cv_profile=$1 RETURNING id',[suggestCv(sample)])).rows.length,0);
  await db.exec("SELECT set_config('app.uid','00000000-0000-4000-8000-000000000002',false);");
  assert.equal((await db.query('UPDATE professionals SET cv_profile=$1 RETURNING id',[suggestCv(sample)])).rows.length,1);
  assert.equal((await db.query('SELECT cv_profile FROM professionals')).rows[0].cv_profile.education[0].title,'Técnico en Administración');
 } finally { await db.close(); }
});
test('multiple compact jobs and studies with month dates keep every entry and responsibility', () => {
 const cv=suggestCv(`EDUCATION\nEngineering Degree, 09/2018 – 08/2021\nUniversity North\nBilingual School, School West 01/2012 – 12/2017\nWORK EXPERIENCE\nNorth Labs, Senior QA Engineer 02/2025 – Present\n• Built automation\nwith the team.\nWest Labs, QA Engineer 04/2024 – 12/2024\n• Improved quality.\nSouth Labs, QA Engineer 07/2022 – 04/2024\n• Built API coverage.\nEast Labs, QA Engineer 01/2018 – 06/2022\n• Maintained tests.\nSKILLS\nFrameworks: Playwright, Selenium.\nTools: Selenium, GitHub Actions.\nLANGUAGES\nEnglish: C2`);
 assert.equal(cv.education.length,2);assert.equal(cv.experience.length,4);
 assert.equal(cv.education[0].period,'09/2018 – 08/2021');assert.equal(cv.education[1].organization,'School West');
 assert.equal(cv.experience[0].organization,'North Labs');assert.equal(cv.experience[0].title,'Senior QA Engineer');assert.equal(cv.experience[0].description,'• Built automation with the team.');
 assert.deepEqual(cv.skills,['Playwright','Selenium','GitHub Actions']);
});
test('title-first headers and Spanish dates are recognized without inventing missing dates',()=>{
 const cv=suggestCv('Experiencia laboral\nIngeniero, Empresa Norte enero 2022 – actualidad\n• Automatización.\n\nAnalista\nEmpresa Sur\n\nEducación\nCurso\nInstituto');
 assert.equal(cv.experience[0].title,'Ingeniero');assert.equal(cv.experience[0].organization,'Empresa Norte');assert.equal(cv.experience[0].period,'enero 2022 – actualidad');assert.equal(cv.experience[1].period,'');
});
test('oversized extracted entries are flagged rather than silently truncated',async()=>{
 const {reviewCv}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const result=reviewCv('WORK EXPERIENCE\nNorth Labs, QA Engineer 2020 – 2024\n• '+ 'x'.repeat(1100));
 assert.equal(result.profile.experience.length,0);assert.ok(result.warnings.includes('limit'));
});
test('anonymous readers see confirmed CV fields but cannot read private contact or write',async()=>{
 const db=new PGlite();try{await db.exec(`create role anon;create table professionals(id int,cv_profile jsonb,contact_email text);alter table professionals enable row level security;create policy public_profile on professionals for select to anon using(id=1);grant select(id) on professionals to anon;insert into professionals values(1,'{"education":[],"experience":[],"skills":[]}','private@example.test'),(2,'{}','hidden@example.test');`);await db.exec(readFileSync('supabase/migrations/264_cv_lectura_publica.sql','utf8'));await db.exec('set role anon');assert.equal((await db.query('select cv_profile from professionals')).rows.length,1);await assert.rejects(db.query('select contact_email from professionals'));await assert.rejects(db.query("update professionals set cv_profile='{}'"));}finally{await db.close()}
});
test('PDF visual rows attach side dates and join adjacent text fragments',async()=>{
 const source=ts.transpileModule(readFileSync('src/lib/cv/pdf-lines.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const {pdfTextLines}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const item=(str,x,y,width)=>({str,transform:[10,0,0,10,x,y],width,height:10});
 const rows=pdfTextLines([item('School',10,90,35),item('2020 – 2024',400,100,60),item('Engineering',10,100,65),item('CI/',10,80,12),item('CD',22,80,12)]);
 assert.equal(rows,'Engineering 2020 – 2024\nSchool\nCI/CD');
});
