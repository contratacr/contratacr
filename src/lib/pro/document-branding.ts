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
export const documentBrandingSchema=z.object({revision:z.number().int().min(0),theme:z.enum(['celeste','marino','bosque','terracota']),displayName:z.string().max(120),tagline:z.string().max(160),footer:z.string().max(300),logo:z.object({path:z.string(),sha256:z.string(),bytes:z.number().int()}).nullable()});
export type DocumentBranding=z.infer<typeof documentBrandingSchema>;
export const documentBrandingInputSchema=z.object({actionId:z.string().uuid(),revision:z.number().int().min(0),theme:z.enum(['celeste','marino','bosque','terracota']),displayName:z.string().trim().max(120),tagline:z.string().trim().max(160),footer:z.string().trim().max(300),logo:z.union([z.literal('keep'),z.null(),z.object({base64:z.string().min(4)}).strict()])}).strict();
export type PrintBranding={theme:DocumentTheme;displayName:string;tagline:string;footer:string;logoDataUri:string|null};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[char]!);
/**
 * Applies the company branding to an existing print template (all of them share the same structure:
 * <main>, a header with the approved ContrataCR mark, accent #008bb5). The accent becomes the chosen
 * theme colour; a company block (logo, name, line) goes right after the header and the footer line at
 * the end of <main>. The ContrataCR mark itself is not altered. All user text is escaped.
 */
export function applyDocumentBranding(html:string,branding:PrintBranding|null){
 if(!branding)return html;
 const theme=documentThemes[branding.theme]??documentThemes.celeste;
 let out=html.replaceAll('#008bb5',theme.accent).replaceAll('#eaf7fb',theme.soft);
 const css=`.ccr-company{display:flex;align-items:center;gap:14px;margin:14px 0 4px;padding:12px 14px;border-radius:12px;background:${theme.soft};border-left:4px solid ${theme.accent}}.ccr-company img{max-height:56px;max-width:160px;object-fit:contain}.ccr-company strong{display:block;font-size:17px;color:#162543}.ccr-company span{display:block;font-size:13px;color:#52627a}.ccr-company-footer{margin-top:22px;padding-top:10px;border-top:2px solid ${theme.accent};font-size:12px;color:#52627a;white-space:pre-wrap}@media print{.ccr-company{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
 out=out.replace('</style>',css+'</style>');
 const hasBlock=!!(branding.logoDataUri||branding.displayName||branding.tagline);
 if(hasBlock){
  const block=`<section class="ccr-company" data-document-branding="${branding.theme}">${branding.logoDataUri?`<img src="${branding.logoDataUri}" alt="${escape(branding.displayName||'Logo')}">`:''}<div>${branding.displayName?`<strong>${escape(branding.displayName)}</strong>`:''}${branding.tagline?`<span>${escape(branding.tagline)}</span>`:''}</div></section>`;
  const headerEnd=out.indexOf('</header>');
  out=headerEnd>=0?out.slice(0,headerEnd+9)+block+out.slice(headerEnd+9):out.replace(/<main([^>]*)>/,`<main$1>${block}`);
 }else out=out.replace(/<main([^>]*)>/,`<main$1 data-document-branding="${branding.theme}">`);
 if(branding.footer){const end=out.lastIndexOf('</main>');if(end>=0)out=out.slice(0,end)+`<p class="ccr-company-footer">${escape(branding.footer)}</p>`+out.slice(end);}
 return out;
}
/** CSP of the print routes: the company logo is embedded (data:), nothing else is loaded. */
export const printImgSrc="img-src 'self' data:";
