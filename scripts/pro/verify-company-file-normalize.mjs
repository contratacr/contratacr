// Pure local schedule-template recovery contracts. No browser, network or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(root)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},load(url,context,next){return url.startsWith(root)&&url.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:next(url,context);}});
const {normalizeCompanyFile:normalize}=await import('../../src/lib/pro/company-file-normalize.ts');
const {WORK_FILE_MAX_BYTES}=await import('../../src/lib/pro/work-files.ts');
const {default:sharp}=await import('sharp');
const photo=await sharp({create:{width:4,height:2,channels:4,background:{r:20,g:120,b:180,alpha:0.5}}}).withMetadata({orientation:6}).png().toBuffer();
const canonical=await normalize(photo),meta=await sharp(canonical.bytes).metadata();
assert.equal(canonical.mimeType,'image/jpeg');assert.equal(meta.format,'jpeg');assert.equal(meta.width,2);assert.equal(meta.height,4);assert.equal(meta.hasAlpha,false);assert.equal(meta.orientation,undefined);assert.equal(meta.exif,undefined);assert.ok(canonical.bytes.length<=2*1024*1024);
assert.deepEqual((await normalize(photo)).bytes,canonical.bytes,'Retry normalization must be deterministic');
const oversized=await sharp({create:{width:2000,height:1800,channels:3,background:'white'}}).webp().toBuffer(),resized=await normalize(oversized),dimensions=await sharp(resized.bytes).metadata();assert.equal(dimensions.width,1600);assert.ok(dimensions.height<=1600);
const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');const document=await normalize(pdf);assert.equal(document.mimeType,'application/pdf');assert.deepEqual(document.bytes,pdf);assert.notEqual(document.bytes,pdf,'Returned PDF must not alias mutable caller bytes');
for(const invalid of [Buffer.alloc(0),Buffer.alloc(WORK_FILE_MAX_BYTES+1),Buffer.from('not an image'),Buffer.from('%PDF-1.7\nmissing trailer'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>')])await assert.rejects(normalize(invalid));
console.log('Company-file normalization passed: image orientation, metadata stripping, opaque JPEG, resize, deterministic bytes, PDF boundary preservation and invalid/oversized rejection. No network or database.');
