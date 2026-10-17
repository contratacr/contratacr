import { buildSync } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";
const module = { exports: {} };
const compiled = buildSync({ stdin: { contents: `export * from './src/lib/display-name'; export * from './src/lib/auth/provider-display-name'; export * from './src/lib/nombre-corto';`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "cjs", platform: "node" }).outputFiles[0].text;
vm.runInNewContext(compiled, { module });
const exports = module.exports;
for (const mode of ["desktop", "mobile"]) {
  assert.equal(exports.formatPersonDisplayName("Isaac Alberto Sanchez Monge", mode), "Isaac Sanchez Monge");
  for (const name of ["Ana María López", "María José Vargas Rojas", "Luis de la Cruz", "Juan Carlos Vargas Rojas", "Servicios Electricos del Valle"]) assert.equal(exports.formatPersonDisplayName(name, mode), name);
}
assert.equal(exports.getProfessionalDisplayName("Isaac Alberto Sanchez Monge", "Empresa Uno Dos Tres").primaryMobile, "Empresa Uno Dos Tres");
assert.equal(exports.nombreCorto("Ana María López"), "Ana María López");
assert.equal(exports.providerDisplayName({ full_name: "relay123" }, "relay123@privaterelay.appleid.com"), "");
assert.equal(exports.providerDisplayName({ full_name: "", name: "Isaac Sanchez" }, "relay123@privaterelay.appleid.com"), "Isaac Sanchez");
assert.equal(exports.providerDisplayName({}, "someone@example.com"), "");
console.log("Public names and provider greeting checks passed.");
