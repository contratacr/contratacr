// Offline check of the vendored pdf.js used by Mediciones (PDF plans, row 66).
// Source: official npm tarball pdfjs-dist@6.4.299 (published 2026-10-03),
// integrity sha512-AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==
// (build/pdf.min.mjs, build/pdf.worker.min.mjs and LICENSE copied unchanged to public/vendor/pdfjs/).
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const expected={
 'pdf-6.4.299.min.mjs':'57456c8e0c81e46be31174b499ef77f2b9f5ee46d04412ba627320a36755d4c2',
 'pdf.worker-6.4.299.min.mjs':'9536359f1b8367850d485731ca1d5e45c159a7b7a0912325e539937aa21ceb18',
 LICENSE:'0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594',
};
for(const [name,sha] of Object.entries(expected)){const bytes=await readFile('public/vendor/pdfjs/'+name);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha,name);}
const lib=await readFile('public/vendor/pdfjs/pdf-6.4.299.min.mjs','utf8'),source=await readFile('src/lib/pro/takeoff-pdf.ts','utf8');
assert.ok(lib.includes('"6.4.299"'),'library version');assert.ok(source.includes("PDFJS_VERSION='6.4.299'"),'loader version');assert.ok(!/https?:\/\//.test(source.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'')),'no remote URL in the loader');
console.log('PASS vendored pdf.js 6.4.299: library, worker and license hashes match the npm tarball; loader pinned to the local copy');
