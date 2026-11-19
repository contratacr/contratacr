import {z} from 'zod';
/**
 * Round 9: company branding of printed documents — ContrataCR-style theme choices (fixed palette, no
 * free colours), company name/line for the header, a footer line and an optional company logo.
 */
export const documentThemes={
 celeste:{accent:'#008bb5',soft:'#eaf7fb',es:'Celeste ContrataCR',en:'ContrataCR cyan'},
 marino:{accent:'#162543',soft:'#e9eff5',es:'Azul marino',en:'Navy'},
 bosque:{accent:'#0f7a3d',soft:'#e8f5ee',es:'Verde bosque',en:'Forest green'},
 terracota:{accent:'#a34919',soft:'#fbefe7',es:'Terracota',en:'Terracotta'},
} as const;
export type DocumentTheme=keyof typeof documentThemes;
/**
 * Round F1-C (row 45): document template options shared by every branded print. The defaults
 * (classic layout, logo on the left, accent = theme colour, paper chosen by the printer, every field
 * shown, no default texts) reproduce the prints exactly as they were before these options existed.
 */
export const documentTemplateTypes=['quote','invoice','change_order','purchase_order','contract','statement','payment_plan','receipt','selections'] as const;
export type DocumentTemplateType=typeof documentTemplateTypes[number];
export const documentTemplateFields=['codes','unitPrices','taxes','signature','terms','notes'] as const;
export type DocumentTemplateField=typeof documentTemplateFields[number];
const templateText=z.string().max(1000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v)).transform(v=>v.trim());
const templateTexts=z.object({terms:templateText.default(''),notes:templateText.default('')}).strict().prefault({});
export const documentTemplateSchema=z.object({
 layout:z.enum(['classic','modern','compact']).default('classic'),
 logoPosition:z.enum(['left','center','right']).default('left'),
 accent:z.enum(['theme','celeste','marino','bosque','terracota']).default('theme'),
 paper:z.enum(['auto','letter','a4']).default('auto'),
 show:z.object({codes:z.boolean().default(true),unitPrices:z.boolean().default(true),taxes:z.boolean().default(true),signature:z.boolean().default(true),terms:z.boolean().default(true),notes:z.boolean().default(true)}).strict().prefault({}),
 texts:z.object(Object.fromEntries(documentTemplateTypes.map(k=>[k,templateTexts])) as Record<DocumentTemplateType,typeof templateTexts>).strict().prefault({}),
}).strict();
export type DocumentTemplate=z.infer<typeof documentTemplateSchema>;
export const defaultDocumentTemplate=():DocumentTemplate=>documentTemplateSchema.parse({});
export const documentBrandingSchema=z.object({revision:z.number().int().min(0),theme:z.enum(['celeste','marino','bosque','terracota']),displayName:z.string().max(120),tagline:z.string().max(160),footer:z.string().max(300),logo:z.object({path:z.string(),sha256:z.string(),bytes:z.number().int()}).nullable(),template:documentTemplateSchema.prefault({})});
export type DocumentBranding=z.infer<typeof documentBrandingSchema>;
export const documentBrandingInputSchema=z.object({actionId:z.string().uuid(),revision:z.number().int().min(0),theme:z.enum(['celeste','marino','bosque','terracota']),displayName:z.string().trim().max(120),tagline:z.string().trim().max(160),footer:z.string().trim().max(300),logo:z.union([z.literal('keep'),z.null(),z.object({base64:z.string().min(4)}).strict()]),template:documentTemplateSchema.optional()}).strict();
export type PrintBranding={theme:DocumentTheme;displayName:string;tagline:string;footer:string;logoDataUri:string|null;template?:DocumentTemplate};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[char]!);
/**
 * Applies the company branding to an existing print template (all of them share the same structure:
 * <main>, a header with the approved ContrataCR mark, accent #008bb5). The accent becomes the chosen
 * theme colour; a company block (logo, name, line) goes right after the header and the footer line at
 * the end of <main>. The ContrataCR mark itself is not altered. All user text is escaped.
 */
export function applyDocumentBranding(html:string,branding:PrintBranding|null,type?:DocumentTemplateType){
 if(!branding)return html;
 const theme=documentThemes[branding.theme]??documentThemes.celeste,template=branding.template;
 const accent=template&&template.accent!=='theme'?documentThemes[template.accent].accent:theme.accent;
 let out=html.replaceAll('#008bb5',accent).replaceAll('#eaf7fb',theme.soft);
 const css=`.ccr-company{display:flex;align-items:center;gap:14px;margin:14px 0 4px;padding:12px 14px;border-radius:12px;background:${theme.soft};border-left:4px solid ${accent}}.ccr-company img{max-height:56px;max-width:160px;object-fit:contain}.ccr-company strong{display:block;font-size:17px;color:#162543}.ccr-company span{display:block;font-size:13px;color:#52627a}.ccr-company-footer{margin-top:22px;padding-top:10px;border-top:2px solid ${accent};font-size:12px;color:#52627a;white-space:pre-wrap}@media print{.ccr-company{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
 out=out.replace('</style>',css+'</style>');
 const hasBlock=!!(branding.logoDataUri||branding.displayName||branding.tagline);
 if(hasBlock){
  const block=`<section class="ccr-company" data-document-branding="${branding.theme}">${branding.logoDataUri?`<img src="${branding.logoDataUri}" alt="${escape(branding.displayName||'Logo')}">`:''}<div>${branding.displayName?`<strong>${escape(branding.displayName)}</strong>`:''}${branding.tagline?`<span>${escape(branding.tagline)}</span>`:''}</div></section>`;
  const headerEnd=out.indexOf('</header>');
  out=headerEnd>=0?out.slice(0,headerEnd+9)+block+out.slice(headerEnd+9):out.replace(/<main([^>]*)>/,`<main$1>${block}`);
 }else out=out.replace(/<main([^>]*)>/,`<main$1 data-document-branding="${branding.theme}">`);
 if(branding.footer){const end=out.lastIndexOf('</main>');if(end>=0)out=out.slice(0,end)+`<p class="ccr-company-footer">${escape(branding.footer)}</p>`+out.slice(end);}
 return template?applyDocumentTemplate(out,template,{accent,soft:theme.soft},type??documentTypeOf(html)):out;
}
/** The document type of a print template, from its <main> marker (routes may pass it explicitly). */
export function documentTypeOf(html:string):DocumentTemplateType|undefined{
 const main=/<main([^>]*)>/.exec(html)?.[1]??'';
 const marks:[string,DocumentTemplateType][]=[['data-quote-print','quote'],['data-change-order-print','change_order'],['data-selections-print','selections'],['data-contract-print','contract'],['data-client-statement-print','statement'],['data-payment-plan-print','payment_plan'],['data-purchase-order-print','purchase_order'],['data-invoice-print','invoice'],['data-payment-receipt-print','receipt']];
 return marks.find(([mark])=>main.includes(mark))?.[1];
}
/** True when the template changes nothing (the prints stay byte-identical to the ones without options). */
export function isDefaultDocumentTemplate(template:DocumentTemplate){return JSON.stringify(documentTemplateSchema.parse(template))===JSON.stringify(defaultDocumentTemplate());}
/**
 * Round F1-C: layout variant, logo position, paper and shown fields as extra CSS (fields are marked with
 * data-doc-field in the templates), plus the default terms/notes of this document type before the footer.
 * Nothing is added for the default template. All user text is escaped.
 */
export function applyDocumentTemplate(html:string,input:DocumentTemplate,colors:{accent:string;soft:string},type?:DocumentTemplateType){
 const template=documentTemplateSchema.parse(input);
 if(isDefaultDocumentTemplate(template))return html;
 const rules:string[]=[];const {accent,soft}=colors;
 if(template.layout==='modern')rules.push(`header{background:${soft};border-bottom:0!important;border-radius:14px;padding:14px 16px!important}h1{font-size:27px;letter-spacing:-.01em}h2{text-transform:uppercase;letter-spacing:.06em;font-size:13px;color:${accent}}th{background:${accent}!important;color:#fff;border-bottom:0}.ccr-company{border-left:0;border-radius:14px;border:1px solid ${accent}}.totals .grand,.total{color:${accent}}@media print{header,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`);
 if(template.layout==='compact')rules.push(`body{font-size:12px;padding:16px}h1{font-size:19px;margin:12px 0 2px}h2{font-size:14px;margin:14px 0 4px}th,td{padding:4px 4px}.columns,.details{gap:12px;margin-top:8px}.ccr-company{padding:8px 10px;margin:8px 0 2px;gap:10px}.ccr-company img{max-height:40px}.ccr-company strong{font-size:15px}.sign{margin-top:22px}footer{margin-top:14px}`);
 if(template.logoPosition==='center')rules.push(`.ccr-company{flex-direction:column;justify-content:center;text-align:center}`);
 if(template.logoPosition==='right')rules.push(`.ccr-company{flex-direction:row-reverse;justify-content:space-between;text-align:right}`);
 if(template.paper!=='auto')rules.push(`@media print{@page{size:${template.paper==='a4'?'A4':'letter'}}}`);
 const hidden=documentTemplateFields.filter(field=>!template.show[field]);
 if(hidden.length)rules.push(hidden.map(field=>`[data-doc-field="${field}"]`).join(',')+'{display:none!important}');
 let out=html;
 // A hidden table column (a <th> marked with the field) would leave full-width rows (section names, subtotals)
 // one column too wide: their colspan shrinks by the number of hidden columns so every row stays aligned.
 const hiddenColumns=hidden.filter(field=>new RegExp(`<th[^>]*data-doc-field="${field}"`).test(html)).length;
 if(hiddenColumns)out=out.replace(/colspan="(\d+)"/g,(m,n)=>`colspan="${Math.max(1,Number(n)-hiddenColumns)}"`);
 if(rules.length)out=out.replace('</style>',`.ccr-doc-texts{margin-top:20px}.ccr-doc-texts h2{color:${accent}}.ccr-doc-texts p{white-space:pre-wrap;overflow-wrap:anywhere}`+rules.join('')+'</style>');
 const texts=type?template.texts[type]:null,en=/<html[^>]*lang="en"/.test(html);
 const blocks=[texts?.terms&&template.show.terms?`<section data-document-terms><h2>${en?'Terms':'Condiciones'}</h2><p>${escape(texts.terms)}</p></section>`:'',texts?.notes&&template.show.notes?`<section data-document-notes><h2>${en?'Notes':'Notas'}</h2><p>${escape(texts.notes)}</p></section>`:''].join('');
 if(blocks){
  if(!rules.length)out=out.replace('</style>',`.ccr-doc-texts{margin-top:20px}.ccr-doc-texts h2{color:${accent}}.ccr-doc-texts p{white-space:pre-wrap;overflow-wrap:anywhere}</style>`);
  const section=`<div class="ccr-doc-texts" data-document-texts="${type}">${blocks}</div>`;
  // Before the signature block when there is one (terms are read before signing), else before the footer.
  const sign=out.lastIndexOf('<div class="sign"'),at=sign>=0?sign:out.lastIndexOf('<footer'),end=out.lastIndexOf('</main>');
  out=at>=0&&at<end?out.slice(0,at)+section+out.slice(at):end>=0?out.slice(0,end)+section+out.slice(end):out;
 }
 // Options that do not touch this document (e.g. only another type's texts) leave it exactly as it was.
 if(!rules.length&&!blocks)return html;
 return out.replace(/<main([^>]*)>/,(m,attrs)=>`<main${attrs} data-document-template="${template.layout}">`);
}
/** CSP of the print routes: the company logo is embedded (data:), nothing else is loaded. */
export const printImgSrc="img-src 'self' data:";
