import { clientSchema, productSchema, saveClient, saveProduct, type Business, type Client, type Product } from './business';
export type CatalogKind = 'clients' | 'products';
export const catalogColumns = {
 clients: ['name','email','phone','identification','tradeName','group','address','notes'],
 products: ['sku','name','stock','minimum','cost','price','category','unit','cabys'],
} as const;
export type ImportIssue = { row: number; message: string };
export type CatalogPreview = { kind: CatalogKind; clients: Client[]; products: Product[]; issues: ImportIssue[]; count: number };
/** CSV only: no macros, formulas, remote URLs or spreadsheet evaluation. */
export function parseCatalogCsv(text: string): string[][] {
 if(new TextEncoder().encode(text).length>2_000_000)throw Error('El archivo supera 2 MB.');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const input=text.replace(/^\uFEFF/,'');
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(quoted){if(ch==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(ch==='"'){if(cell||closed)throw Error('Comillas CSV inválidas.');quoted=true;continue;}
  if(ch===','||ch==='\n'||ch==='\r'){
   row.push(cell);cell='';closed=false;
   if(ch!==','){if(ch==='\r'&&input[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>501)throw Error('Importe como máximo 500 registros.');}
  }else{if(closed&&ch.trim())throw Error('Texto después de comillas CSV.');if(!closed)cell+=ch;}
 }
 if(quoted)throw Error('Comillas CSV sin cerrar.');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length>501)throw Error('Importe como máximo 500 registros.');
 return rows;
}
export function previewCatalogImport(text:string,kind:CatalogKind,data:Business,newId:()=>string):CatalogPreview{
 const rows=parseCatalogCsv(text);const columns=rows.shift()?.map(v=>v.trim())||[];
 const allowed:readonly string[]=catalogColumns[kind];
 if(!columns.length||new Set(columns).size!==columns.length||columns.some(c=>!allowed.includes(c))||!columns.includes('name')||(kind==='products'&&!columns.includes('sku')))throw Error('Use las columnas de la plantilla de esta sección.');
 if(!rows.length)throw Error('El archivo no contiene registros.');
 const result:CatalogPreview={kind,clients:[],products:[],issues:[],count:rows.length};
 const skus=new Set(data.products.map(p=>p.sku.toLowerCase()));
 const ids=new Set(data.clients.map(c=>c.identification).filter(Boolean));
 const numeric=(value:string|undefined)=>{if(!value?.trim())return 0;if(!/^\d+(?:\.\d+)?$/.test(value.trim()))throw Error('Use números positivos sin separadores de miles y punto decimal.');return Number(value);};
 rows.forEach((cells,index)=>{
  try{
   if(cells.length!==columns.length)throw Error('La cantidad de columnas no coincide.');
   const row=Object.fromEntries(columns.map((c,i)=>[c,cells[i].trim()]));
   // Never accept formula-like values. Report instead of silently changing the file.
   if(Object.values(row).some(v=>/^[=+@]/.test(v)&&!/^\+\d[\d ()-]*$/.test(v)))throw Error('No se permiten fórmulas.');
   if(kind==='clients'){
    const parsed=clientSchema.safeParse({id:newId(),name:row.name,email:row.email||'',phone:row.phone||'',notes:row.notes||'',archived:false,identification:row.identification||'',tradeName:row.tradeName||'',group:row.group||'',address:row.address||''});
    if(!parsed.success)throw Error('Revise nombre, correo, identificación y longitud de los campos.');
    if(parsed.data.identification&&ids.has(parsed.data.identification))throw Error('Esa identificación ya existe en el catálogo o archivo.');
    if(parsed.data.identification)ids.add(parsed.data.identification);
    result.clients.push(parsed.data);
   }else{
    const parsed=productSchema.safeParse({id:newId(),sku:row.sku,name:row.name,stock:numeric(row.stock),minimum:numeric(row.minimum),cost:numeric(row.cost),price:numeric(row.price),archived:false,category:row.category||'',unit:row.unit||'',cabys:row.cabys||''});
    if(!parsed.success)throw Error('Revise código, nombre, cantidades y CABYS de 13 dígitos.');
    if(skus.has(parsed.data.sku.toLowerCase()))throw Error('Ese código ya existe en el catálogo o archivo.');
    skus.add(parsed.data.sku.toLowerCase());result.products.push(parsed.data);
   }
  }catch(e){result.issues.push({row:index+2,message:e instanceof Error?e.message:'Registro inválido.'});}
 });
 return result;
}
/** Revalidate against latest state, without partial writes or overwriting existing IDs. */
export function applyCatalogImport(data:Business,preview:CatalogPreview):Business{
 if(preview.issues.length||preview.clients.length+preview.products.length!==preview.count||!preview.count)throw Error('Corrija todos los errores antes de importar.');
 if((preview.kind==='clients'&&preview.products.length)||(preview.kind==='products'&&preview.clients.length))throw Error('Tipo de catálogo inválido.');
 let next=data;
 for(const row of preview.clients){
  if(next.clients.some(c=>c.id===row.id||Boolean(row.identification&&c.identification===row.identification)))throw Error('El cliente ya existe. Vuelva a revisar el archivo.');
  next=saveClient(next,row);
 }
 for(const row of preview.products){if(next.products.some(p=>p.id===row.id))throw Error('El producto ya existe.');next=saveProduct(next,row);}
 if(next.clients.length>10000||next.products.length>10000)throw Error('El catálogo supera el límite de registros.');
 return next;
}
