// Pure local schedule-template recovery contracts. No browser, network or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(root)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},load(url,context,next){return url.startsWith(root)&&url.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:next(url,context);}});
const {scheduleTemplatePresets:presets,createScheduleTemplatePreset:create}=await import('../../src/lib/pro/schedule-template-presets.ts');
const {scheduleTemplateMutationSchema}=await import('../../src/lib/pro/schedule-templates.ts');
assert.equal(presets.length,7);assert.equal(new Set(presets.map(p=>p.id)).size,7);
const all=new Set();let definitions=0;
for(const preset of presets)for(const locale of ['es','en']){
 const definition=create(preset.id,locale);assert.equal(definition.name,preset[locale]);assert.match(definition.notes,locale==='en'?/Example dates/:/Fechas de ejemplo/);
 const parsed=scheduleTemplateMutationSchema.parse({action:'save',actionId:crypto.randomUUID(),templateId:crypto.randomUUID(),revision:0,...definition});
 assert.equal(parsed.phases.length,parsed.tasks.length);assert.equal(parsed.milestones.length,1);assert.equal(parsed.tasks[0].startOffset,0);
 for(const item of [...parsed.phases,...parsed.tasks,...parsed.milestones]){assert.equal(all.has(item.id),false,'Examples must never reuse mutable IDs');all.add(item.id);}
 for(const [index,task]of parsed.tasks.entries()){assert.equal(task.details,'');assert.equal(task.assignee,'');assert.equal(task.dueOffset,null);assert.equal(task.phaseId,parsed.phases[index].id);assert.deepEqual(task.dependsOn,index?[parsed.tasks[index-1].id]:[]);assert.ok(task.startOffset<=task.endOffset);if(index)assert.ok(task.startOffset>=parsed.tasks[index-1].endOffset);}
 assert.ok(parsed.milestones[0].offset>parsed.tasks.at(-1).endOffset);definitions++;
 const changed=create(preset.id,locale);changed.tasks[0].title='LOCAL_EDIT';changed.tasks[0].dependsOn.push(crypto.randomUUID());assert.notEqual(create(preset.id,locale).tasks[0].title,'LOCAL_EDIT');assert.equal(create(preset.id,locale).tasks[0].dependsOn.length,0);
}
assert.throws(()=>create('unknown','es'));
console.log(definitions+' bilingual editable plan examples validated: DAG, dates, fresh IDs, private fields and mutation isolation. No browser or database.');
