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
