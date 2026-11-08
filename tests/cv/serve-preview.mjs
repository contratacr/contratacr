// Isolated actual-component preview: synthetic account; no auth or production I/O.
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root=process.cwd(); const out='/tmp/ccr-cv-review/site'; await mkdir(out,{recursive:true});
await build({entryPoints:['tests/cv/preview.tsx'],bundle:true,splitting:true,format:'esm',outdir:out,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},alias:{'@':resolve(root,'src'),'@/lib/supabase/client':resolve(root,'tests/cv/supabase-mock.ts')},plugins:[{
 name:'isolated-preview',setup(b){
  b.onResolve({filter:/^(next\/navigation|next\/link|@\/i18n\/navigation|@\/lib\/data\/use-custom-categories)$/},args=>({path:args.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',resolveDir:root,contents:args.path.includes('use-custom') ? 'export const useCustomCategories=()=>[];' : `import React from 'react'; export const Link=({href,children,...props})=>React.createElement('a',{href:typeof href==='string'?href:'/',...props},children); export default Link; export const useRouter=()=>({push(){},replace(){},refresh(){},back(){}}); export const usePathname=()=>'/dashboard/profesional'; export const useSearchParams=()=>new URLSearchParams();`}));
 }}]});
const css=await postcss([tailwind({base:root})]).process(await readFile('src/app/globals.css','utf8'),{from:resolve(root,'src/app/globals.css')});await writeFile(out+'/style.css',css.css);
await writeFile(out+'/index.html','<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/preview.js"></script></html>');
createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/professional-cv'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({file:null}));return;}
 const file=(pathname.startsWith('/vendor/') || pathname.startsWith('/brand/') || pathname==='/logo-mark-transparent.png') ? resolve(root,'public'+pathname) : pathname==='/' ? out+'/index.html' : resolve(out,'.'+pathname);
 if(!file.startsWith(out+'/')&&!file.startsWith(root+'/public/vendor/')&&!file.startsWith(root+'/public/brand/')&&file!==root+'/public/logo-mark-transparent.png'){res.writeHead(403).end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}}).listen(3194,'127.0.0.1',()=>console.log('CV preview http://127.0.0.1:3194'));
