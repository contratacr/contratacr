// Pure date-prefill contracts. No browser, network or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);}});
const {taskTemplateJobStartDate:prefill}=await import('../../src/lib/pro/task-template-dates.ts'),fallback='2026-11-09';
const cases=[['2026-11-09','2026-11-09'],['2024-02-29','2024-02-29'],['2024-03-01T00:00:00Z','2024-02-29'],['2024-02-29T09:00:00-06:00','2024-02-29'],['2024-03-01T02:00:00+02:00','2024-02-29'],['2024-02-30',fallback],['2024-02-30T09:00:00-06:00',fallback],['2024-02-29T09:00:00',fallback],['invalid',fallback],['',fallback]];
const previous=process.env.TZ;
try{for(const zone of ['UTC','America/Los_Angeles','Asia/Tokyo']){process.env.TZ=zone;for(const[source,expected]of cases)assert.equal(prefill(source,fallback),expected,zone+' '+source);}}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
assert.throws(()=>prefill('2024-02-29','not-a-date'));
console.log('31 task-template date prefill contracts passed');
