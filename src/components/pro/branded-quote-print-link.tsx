'use client';
import {useLocale,useTranslations} from 'next-intl';
/**
 * Round F2-D (register row 45): print or save as PDF a shared quote version with the company document branding
 * of the professional who sent it. Opens the private server print (/api/pro/quote-print?publicationId=…), which
 * re-authorizes the account (owner or the customer of that version); there is no public URL.
 */
export function BrandedQuotePrintLink({publicationId,side,disabled=false}:{publicationId:string;side:'owner'|'client';disabled?:boolean}){
 const t=useTranslations('proBrandedQuotePrint'),locale=useLocale();
 const href='/api/pro/quote-print?'+new URLSearchParams({publicationId,lang:locale.startsWith('en')?'en':'es'});
 return <span className="inline-flex flex-col gap-1">
  <a data-quote-publication-print-link={side} href={disabled?undefined:href} aria-disabled={disabled||undefined} target="_blank" rel="noopener" className={'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#008bb5] bg-white px-4 text-sm font-semibold text-[#00698c] hover:bg-[#eaf7fb]'+(disabled?' pointer-events-none opacity-50':'')}>{side==='owner'?t('printOwner'):t('printClient')}</a>
  {side==='client'&&<span className="text-xs text-[#52627a]">{t('clientHint')}</span>}
 </span>;
}
