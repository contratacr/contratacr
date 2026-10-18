const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: (name) => { if (!(name in imports)) throw Error(name); return imports[name]; } });
  return exports;
}
const ids = load('src/lib/cedula.ts');
const { projectIdentity } = load('src/lib/projects/project-identity.ts', { '../cedula': ids });
assert.equal(projectIdentity('', null), null);
assert.equal(projectIdentity('123', null), null);
for (const id of ['208060421', '3101234567', '155801373125', '5001234567']) {
  assert.equal(projectIdentity(id, null), id);
  assert.equal(projectIdentity('', { cedula: id, client_identity_status: 'verified' }), id);
  assert.equal(projectIdentity('', { cedula: id, client_identity_status: 'pending' }), null);
  assert.equal(projectIdentity('123', { cedula: id, client_identity_status: 'verified' }), null);
}
assert.equal(projectIdentity('2-0806-0421', null), '208060421');
const route = fs.readFileSync('src/app/api/projects/route.ts', 'utf8');
assert.ok(route.indexOf('if (!requiredIdentity)') < route.indexOf('let clientIdentityStatus'));
const badge = fs.readFileSync('src/components/ui/verification-info.tsx', 'utf8');
assert.match(badge, /audience === "client" \? "clientScope" : "scope"/);
for (const lang of ['es', 'en']) {
  const copy = JSON.parse(fs.readFileSync(`messages/${lang}.json`, 'utf8')).verificationBadge;
  assert.ok(copy.clientScope && copy.clientScope !== copy.scope);
  assert.doesNotMatch(copy.clientScope, /Hacienda|certificaciones|certifications/);
}
console.log('Project identity: 19 runtime cases and API/badge copy checks passed.');
