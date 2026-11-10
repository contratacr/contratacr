import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('src/lib/public-workplaces.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const { isFixedWorkplace, publicWorkplaces, directionsUrl } = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const location = {name:'Local de ejemplo',address:'Dirección de ejemplo',lat:9.9,lng:-84.2,level:'canton'};
test('existing pins stay off until explicit opt-in',()=>{
 assert.deepEqual(publicWorkplaces([location,{...location,showAddress:false}]),[]);
 assert.equal(directionsUrl(location),null);
 assert.equal(publicWorkplaces([{...location,showAddress:true}]).length,1);
});
test('coverage and invalid coordinates cannot expose an address or a route',()=>{
 for(const w of [{...location,level:'country'},{...location,level:'provincia'},{...location,lat:undefined},{...location,lng:NaN},{...location,lat:91},{...location,lng:Infinity}]){
  assert.equal(isFixedWorkplace(w),false);
  assert.deepEqual(publicWorkplaces([{...w,showAddress:true}]),[]);
  assert.equal(directionsUrl({...w,showAddress:true}),null);
 }
});
test('directions retain the saved point and never supply a visitor origin',()=>{
 const url=new URL(directionsUrl({...location,showAddress:true}));
 assert.equal(url.origin,'https://www.google.com');assert.equal(url.pathname,'/maps/dir/');
 assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('destination'),'9.9,-84.2');assert.equal(url.searchParams.has('origin'),false);
});
test('multiple sites remain distinct and duplicate points appear once',()=>{
 const a={...location,showAddress:true},b={...a,lng:-84.3};
 assert.deepEqual(publicWorkplaces([a,{...a,id:'duplicate'},b]),[a,b]);
 assert.deepEqual(publicWorkplaces([{...a,showAddress:false},b]),[b]);
});
