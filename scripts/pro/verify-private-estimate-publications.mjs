import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(root)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(root)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const d=await import('../../src/lib/pro/private-estimate-publications.ts');
const uuid=()=>crypto.randomUUID(),hash='a'.repeat(64),code='b'.repeat(64);
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
const publish=()=>({action:'publish',actionId:uuid(),publicationId:uuid(),estimateId:uuid(),estimateRevision:1,recipient:{kind:'claim',email:'Client@Example.test',code}});
test('manual claim normalizes email but never implies acceptance',()=>{
 const parsed=d.privateEstimatePublicationMutationSchema.parse(publish());
 assert.equal(parsed.recipient.email,'client@example.test');
 assert.equal(d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),code}).action,'claim');
 assert.throws(()=>d.privateEstimatePublicationMutationSchema.parse({...publish(),accepted:true}));
});
// Round 2 replaced the 64-hex access code by a readable one: 20 Crockford base32 symbols (100 random
// bits) shown as XXXXX-XXXXX-XXXXX-XXXXX. Codes issued before keep working: 64 hexadecimal
// characters, any case (normalized to lower case). Anything else is rejected before any hashing.
test('raw code is a readable 20-symbol code or a legacy 64-hex code, and codeHash is not a caller mutation',()=>{
 const readable=d.newEstimateAccessCode();
 assert.match(readable,/^[0-9A-HJKMNP-TV-Z]{20}$/);
 assert.equal(d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),code:readable}).code,readable);
 // Shown form, lower case, spaces and the ambiguous O/I/L normalize to the same stored code.
 assert.equal(d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),code:' '+d.formatEstimateAccessCode(readable).toLowerCase()+' '}).code,readable);
 assert.equal(d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),code:'OOOOO-IIIII-LLLLL-00000'}).code,'00000111111111100000');
 // Legacy 64-hex codes remain accepted (case-insensitive) and keep their exact value.
 assert.equal(d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),code:'b'.repeat(64)}).code,'b'.repeat(64));
 assert.equal(d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),code:'A'.repeat(64)}).code,'a'.repeat(64));
 assert.ok(d.isEstimateAccessCode('A'.repeat(64))&&d.isEstimateAccessCode(readable));
 for(const bad of ['a'.repeat(63),'a'.repeat(65),'x'.repeat(64),'A'.repeat(19),'A'.repeat(21),'UUUUU-UUUUU-UUUUU-UUUUU','A'.repeat(81),''])assert.throws(()=>d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),code:bad}),undefined,bad);
 assert.throws(()=>d.privateEstimatePublicationMutationSchema.parse({action:'claim',actionId:uuid(),codeHash:hash}));
});
test('all decisions bind exact publication revision and content hash',()=>{
 for(const action of ['accept','decline','withdraw','request_changes','respond_changes']) {
  const input={action,actionId:uuid(),publicationId:uuid(),revision:1,contentHash:hash,...(action.endsWith('changes')?{note:'Revisión explícita'}:{})};
  assert.equal(d.privateEstimatePublicationMutationSchema.parse(input).action,action);
  assert.throws(()=>d.privateEstimatePublicationMutationSchema.parse({...input,revision:0}));
  assert.throws(()=>d.privateEstimatePublicationMutationSchema.parse({...input,contentHash:'bad'}));
 }
});
test('rotation is explicit and cannot choose another email or recipient',()=>{
 const input={action:'rotate_code',actionId:uuid(),publicationId:uuid(),revision:1,contentHash:hash,code};
 assert.deepEqual(d.privateEstimatePublicationMutationSchema.parse(input),input);
 assert.throws(()=>d.privateEstimatePublicationMutationSchema.parse({...input,email:'other@example.test'}));
});
test('canonical input hashes are independent of key order and retain the raw code',()=>{
 const first=publish(),second=Object.fromEntries(Object.entries(first).reverse());
 assert.equal(d.canonicalPrivateEstimatePublicationInput(first),d.canonicalPrivateEstimatePublicationInput(second));
 assert.ok(d.canonicalPrivateEstimatePublicationInput(first).includes(code));
 assert.notEqual(d.canonicalPrivateEstimatePublicationInput(first),d.canonicalPrivateEstimatePublicationInput({...first,recipient:{...first.recipient,code:'c'.repeat(64)}}));
});
console.log(`${passed} publication input contracts passed; no database, browser or network.`);
