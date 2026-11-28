// Files: folders only (company library and per-project folders). Same writers as /api/pro/company-files
// (folder_save) and /api/pro/work-file-organizer (create_folder). No file rows: a file is listed only once its stored
// object is verified (pro_company_file_ready / pro_work_file_ready), and the owner allows no images or filler
// documents, so uploads are skipped. Folders are never shared with the customer (no share_folder).
import {uuid,tid,must,appModules} from '../lib.mjs';
import {createHash} from 'node:crypto';

const k=(...p)=>uuid(['files',...p].join(':'));
const COMPANY=[
 {key:'contratos',name:'Contratos y garantías (Ejemplo)',favorite:true},
 {key:'plantillas',parent:'contratos',name:'Plantillas de contrato (Ejemplo)'},
 {key:'permisos',name:'Permisos municipales (Ejemplo)'},
 {key:'fichas',name:'Fichas técnicas de proveedores (Ejemplo)'},
 {key:'seguros',name:'Pólizas y seguros (Ejemplo)'},
];
const WORK=[
 {work:'p1',key:'planos',name:'Planos (Ejemplo)'},{work:'p1',key:'permisos',name:'Permisos (Ejemplo)'},{work:'p1',key:'facturas',name:'Facturas de proveedores (Ejemplo)'},
 {work:'p1',key:'cocina',parent:'planos',name:'Cocina (Ejemplo)'},
 {work:'p2',key:'planos',name:'Planos de la terraza (Ejemplo)'},
 {work:'p5',key:'estructurales',name:'Planos estructurales (Ejemplo)'},{work:'p5',key:'cfia',name:'Bitácora y trámites CFIA (Ejemplo)'},{work:'p5',key:'avance',name:'Informes de avance (Ejemplo)'},
];

export async function seed(ctx){
 const {db,apply,owner,log}=ctx,S='files';
 if(!apply){Object.assign(ctx.counts,{company_folders:COMPANY.length,work_folders:WORK.length});log(S,'dry run: would create company and project folders (no files)');return;}
 const app=appModules("export {companyFileMutationSchema,canonicalCompanyFileInput} from './src/lib/pro/company-files';export {organizerInputSchema} from './src/lib/pro/round8';");
 const exists=async(table,id)=>!!await must(table,db.from(table).select('id').eq('owner_id',owner).eq('id',id).maybeSingle());
 let writes=0;
 for(const f of COMPANY){ // parents come first in the list
  const folderId=k('company',f.key);if(await exists('pro_company_folders',folderId))continue;
  const input=app.companyFileMutationSchema.parse({action:'folder_save',actionId:k('company',f.key,'save'),folderId,revision:0,parentId:f.parent?k('company',f.parent):null,name:f.name,favorite:!!f.favorite});
  const hash=createHash('sha256').update(app.canonicalCompanyFileInput(input)).digest('hex');
  const state=await must('company folder',db.rpc('pro_company_files_mutate',{p_actor:owner,p_input:input,p_input_hash:hash}));
  if(!state?.result)throw new Error('company folder: no result');writes++;
 }
 for(const f of WORK){
  const folderId=k('work',f.work,f.key);if(await exists('pro_work_file_folders',folderId))continue;
  const input=app.organizerInputSchema.parse({action:'create_folder',actionId:k('work',f.work,f.key,'create'),workId:tid(f.work),folderId,parentId:f.parent?k('work',f.work,f.parent):null,name:f.name});
  await must('work folder',db.rpc('pro_work_file_organizer_mutate',{p_actor:owner,p_input:input}));writes++;
 }
 const count=async(table,ids)=>{const {count:n,error}=await db.from(table).select('*',{count:'exact',head:true}).eq('owner_id',owner).in('id',ids);if(error)throw new Error(`${table}: ${error.message}`);return n;};
 Object.assign(ctx.counts,{company_folders:await count('pro_company_folders',COMPANY.map(f=>k('company',f.key))),work_folders:await count('pro_work_file_folders',WORK.map(f=>k('work',f.work,f.key)))});
 log(S,`${writes} writes`);
}
