import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
// Install only the compiler already pinned (including integrity) in our lock.
// No application dependencies, lifecycle scripts or generated build artifacts.
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const compiler=lock.packages['node_modules/typescript'];
if(!compiler?.integrity||!/^\d+\.\d+\.\d+$/.test(compiler.version))throw Error('Missing pinned TypeScript compiler');
const root=join(process.env.RUNNER_TEMP,'ccr-ci-planner');
mkdirSync(root,{recursive:true});
writeFileSync(join(root,'package.json'),JSON.stringify({name:'ccr-ci-planner',private:true,version:'1.0.0',dependencies:{typescript:compiler.version}}));
const entry={...compiler};delete entry.dev;
writeFileSync(join(root,'package-lock.json'),JSON.stringify({name:'ccr-ci-planner',version:'1.0.0',lockfileVersion:3,requires:true,packages:{'':{name:'ccr-ci-planner',version:'1.0.0',dependencies:{typescript:compiler.version}},'node_modules/typescript':entry}}));
execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:root,stdio:'inherit'});
appendFileSync(process.env.GITHUB_ENV,`CI_TYPESCRIPT_MODULE=${join(root,'node_modules/typescript/lib/typescript.js')}\n`);
