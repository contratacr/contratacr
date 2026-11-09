import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const bad = /[\u00ab\u00bb\u201c\u201d\u201e]|<<[^=\n]+?>>/;
const errors=[];
for(const file of execFileSync('rg',['--files','src']).toString().trim().split('\n').filter(p=>/\.[jt]sx?$/.test(p))){
  const source=fs.readFileSync(file,'utf8'),root=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function walk(node){
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)||ts.isJsxText(node)){
      // Embedded stylesheet comments are documentation, not client-facing copy.
      const text=node.getText(root).replace(/\/\*[\s\S]*?\*\//g,'');
      if(bad.test(text))errors.push(`${file}:${root.getLineAndCharacterOfPosition(node.getStart()).line+1}`);
    }
    ts.forEachChild(node,walk);
  }walk(root);
}
for(const file of ['messages/es.json','messages/en.json'])if(bad.test(fs.readFileSync(file,'utf8')))errors.push(file);
if(errors.length){console.error('Use straight double quotes in visible text:\n'+errors.join('\n'));process.exit(1);}
console.log('Display quotation contract passed: runtime literals and translations.');
