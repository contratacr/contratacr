import {formatMenuMoney} from '@/lib/directory/menu-price';
import {MENU_DIETARY_LABELS,type PublicMenu,type PublicMenuItem} from '@/lib/directory/menu-schemas';

/**
 * LOCAL PRO ONLY (multivertical P2). Public menu of a restaurant (/negocios/[slug]/menu once wired), data from
 * dir_place_menu_public(slug). Not imported yet. Server component (no state), built for 390 px first:
 * - every price is the FINAL price (IVA 13 % + 10 % service when the place charges it) with its breakdown below;
 * - dietary tags are text chips (never colour only); «Agotado» badge; daily window («De 06:00 a 11:00»);
 * - section jump links wrap (no horizontal page scroll); photos lazy with alt text.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const pct=(bps:number)=>`${(bps/100).toLocaleString('es-CR',{maximumFractionDigits:2})} %`;

export function PlaceMenu({menu,locale}:{menu:PublicMenu;locale:string}){
 const en=locale==='en',lang=en?'en':'es',t=(es:string,english:string)=>en?english:es;
 const money=(minor:number)=>formatMenuMoney(minor,menu.currency,lang);
 const {pricing}=menu,service=pricing.serviceCharge&&pricing.serviceRateBps>0;
 const placeHref=(en?'/en':'')+'/negocios/'+menu.slug;
 const updated=new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'long',timeZone:'America/Costa_Rica'}).format(new Date(menu.updatedAt));
 const priceNote=service
  ?t(`Precios finales: incluyen IVA (${pct(pricing.ivaRateBps)}) y servicio (${pct(pricing.serviceRateBps)}).`,`Final prices: IVA (${pct(pricing.ivaRateBps)}) and service (${pct(pricing.serviceRateBps)}) included.`)
  :t(`Precios finales: incluyen IVA (${pct(pricing.ivaRateBps)}). Esta empresa indica que no cobra servicio.`,`Final prices: IVA (${pct(pricing.ivaRateBps)}) included. This business states it does not charge service.`);
 return <main id="contenido" data-place-menu={menu.slug} className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-[#162543] sm:py-12">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="text-sm">
   <a className={`underline underline-offset-2 ${ring}`} href={placeHref}>← {menu.name}</a>
  </nav>
  <header className="space-y-2">
   <h1 className="break-words text-3xl font-extrabold leading-tight">{t('Menú','Menu')} · {menu.name}</h1>
   <p data-menu-price-note className="rounded-xl bg-[#eef6fb] px-4 py-3 text-sm font-medium">{priceNote}</p>
  </header>

  {menu.sections.length===0?<p className="text-slate-700">{t('Esta empresa aún no publicó su menú.','This business has not published its menu yet.')}</p>:<>
   {menu.sections.length>1&&<nav aria-label={t('Secciones del menú','Menu sections')}>
    <ul className="flex flex-wrap gap-2">{menu.sections.map((s,i)=><li key={i}>
     <a href={`#menu-s-${i}`} className={`inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold ${ring}`}>{(en?s.nameEn:null)??s.nameEs}</a></li>)}</ul>
   </nav>}
   {menu.sections.map((s,i)=><section key={i} id={`menu-s-${i}`} aria-labelledby={`menu-h-${i}`} className="scroll-mt-4 space-y-3">
    <h2 id={`menu-h-${i}`} className="border-b border-[#d7e1ea] pb-1 text-xl font-bold">{(en?s.nameEn:null)??s.nameEs}</h2>
    {((en?s.descriptionEn:null)??s.descriptionEs)&&<p className="text-sm text-slate-700">{(en?s.descriptionEn:null)??s.descriptionEs}</p>}
    <ul className="divide-y divide-[#e6edf3]">{s.items.map((item,j)=><li key={j}><MenuItemRow item={item} en={en} money={money} service={service}/></li>)}</ul>
   </section>)}
  </>}

  <footer className="space-y-1 border-t border-[#d7e1ea] pt-4 text-sm text-slate-700">
   <p>{t('Menú y precios informados por la empresa.','Menu and prices provided by the business.')} {t('Actualizado el','Updated on')} {updated}.</p>
  </footer>
 </main>;
}

function MenuItemRow({item,en,money,service}:{item:PublicMenuItem;en:boolean;money:(minor:number)=>string;service:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 const name=(en?item.nameEn:null)??item.nameEs,description=(en?item.descriptionEn:null)??item.descriptionEs;
 const soldOut=item.availability==='sold_out',p=item.price;
 return <article data-menu-item className={`flex gap-3 py-3 ${soldOut?'opacity-70':''}`}>
  {item.photoUrl&&/* eslint-disable-next-line @next/next/no-img-element -- https URLs validated by the database */
   <img src={item.photoUrl} alt={(en?item.photoAltEn:item.photoAltEs)??name} loading="lazy" className="size-20 shrink-0 rounded-xl object-cover"/>}
  <div className="min-w-0 flex-1 space-y-1">
   <div className="flex items-start justify-between gap-3">
    <h3 className="break-words font-semibold">{name}</h3>
    <p className="shrink-0 text-right font-bold" data-menu-total={p.total}><span className="sr-only">{t('Precio final','Final price')}: </span>{money(p.total)}</p>
   </div>
   {description&&<p className="text-sm text-slate-700">{description}</p>}
   <p className="text-xs text-slate-700" data-menu-breakdown>
    {t('Base','Base')} {money(p.base)} · IVA {money(p.iva)}{service?` · ${t('Servicio','Service')} ${money(p.service)}`:''}
   </p>
   {(item.dietary.length>0||soldOut||item.availableFrom)&&<ul className="flex flex-wrap gap-1.5 pt-0.5 text-xs" aria-label={t('Detalles','Details')}>
    {soldOut&&<li className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-800" data-menu-sold-out>{t('Agotado','Sold out')}</li>}
    {item.dietary.map(tag=><li key={tag} data-menu-tag={tag} className="rounded-full border border-emerald-700/40 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-900">{MENU_DIETARY_LABELS[tag][en?'en':'es']}</li>)}
    {item.availableFrom&&item.availableUntil&&<li className="rounded-full border border-slate-300 px-2.5 py-1">{t(`De ${item.availableFrom} a ${item.availableUntil}`,`${item.availableFrom}–${item.availableUntil}`)}</li>}
   </ul>}
  </div>
 </article>;
}
