'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {siteThemeTokens} from '@/lib/pro/site';
import {filterSiteTemplates,siteTemplateFilterLabels,siteTemplateFilters,siteTemplates,type SiteTemplate,type SiteTemplateFilter} from '@/lib/pro/site-templates';

/** Area E: template gallery of the website builder (filters, suggested and all templates, preview and apply). */
function Wireframe({template}:{template:SiteTemplate}){
 const tokens=siteThemeTokens[template.theme];
 return <div aria-hidden="true" className="space-y-1 rounded-lg border p-2" style={{background:tokens.bg,borderColor:tokens.border}}>
  {template.order.filter(type=>!template.hidden.includes(type)).map((type,i)=><div key={type} className="rounded" style={{height:i===0?28:12,background:i===0?tokens.heroBg:tokens.surface,border:'1px solid '+tokens.border}}/>)}
 </div>;
}
export function SiteTemplateGallery({en,onPreview,onApply,disabled}:{en:boolean;onPreview:(template:SiteTemplate)=>void;onApply:(template:SiteTemplate)=>void;disabled?:boolean}){
 const t=(es:string,english:string)=>en?english:es,l=en?'en':'es',[filters,setFilters]=useState<SiteTemplateFilter[]>([]);
 const shown=filterSiteTemplates(siteTemplates,filters),suggested=shown.filter(x=>x.suggested),rest=shown.filter(x=>!x.suggested);
 const card=(template:SiteTemplate)=><li key={template.id} data-site-template={template.id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
  <Wireframe template={template}/><p className="font-semibold text-[#162543]">{template.name[l]}</p>
  <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" className="min-h-11" data-site-template-preview onClick={()=>onPreview(template)}>{t('Vista previa','Preview')}</Button><Button type="button" size="sm" className="min-h-11" data-site-template-apply disabled={disabled} onClick={()=>onApply(template)}>{t('Usar plantilla','Use template')}</Button></div></li>;
 return <section data-site-templates className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5" aria-labelledby="site-templates-title">
  <h3 id="site-templates-title" className="font-bold">{t('Elija una plantilla','Choose a template')}</h3>
  <p className="text-sm text-[#52627a]">{t('Una plantilla cambia el estilo, el orden y las secciones visibles. No borra sus textos, servicios ni fotos.','A template changes the style, order and visible sections. It does not delete your texts, services or photos.')}</p>
  <div role="group" aria-label={t('Filtrar por','Filter by')} className="flex flex-wrap gap-2">{siteTemplateFilters.map(f=><button key={f} type="button" data-site-template-filter={f} aria-pressed={filters.includes(f)} onClick={()=>setFilters(prev=>prev.includes(f)?prev.filter(x=>x!==f):[...prev,f])} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filters.includes(f)?'border-[#008bb5] bg-[#e6f6fb] text-[#007aa0]':'border-[#d7e1ea] text-[#52627a]'}`}>{siteTemplateFilterLabels[f][l]}</button>)}</div>
  {!shown.length&&<p data-site-template-empty className="text-sm text-[#52627a]">{t('Ninguna plantilla cumple todos los filtros.','No template matches all the filters.')}</p>}
  {suggested.length>0&&<div><p className="text-sm font-bold">{t('Sugeridas para usted','Suggested for you')}</p><ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{suggested.map(card)}</ul></div>}
  {rest.length>0&&<div><p className="text-sm font-bold">{t('Todas las plantillas','All templates')}</p><ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rest.map(card)}</ul></div>}
 </section>;
}
