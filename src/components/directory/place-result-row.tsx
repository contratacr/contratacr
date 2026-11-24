import {Camera,MapPin,Star} from 'lucide-react';
import type {PlaceSearchItem} from '@/lib/directory/search-schemas';
import type {CardExtra} from '@/lib/directory/card-extras';
import {kindLabel} from '@/lib/directory/place-verticals';
import {placeAmenities,placeCuisines,placePriceLevel} from '@/lib/directory/place-amenities';
import {placeActionSpec,resolvePlaceActions,type PlaceActionId} from '@/lib/directory/place-actions';
import {placePhotoSrc} from '@/lib/directory/place-photos';
import {ActionButton,actionIcon} from './place-action-buttons';
import {InfoBadge,ReadMoreText} from './result-row-parts';

/**
 * Result row of a place in the app list (Yelp model, our colours): photo strip with a "Ver todas" tile, "1. Name",
 * stars with the review count (abbreviated from 1000), pin + area, price level and Abierto/Cerrado, local-business badge,
 * snippet with "Leer más", category chips and the primary pill chosen by lib/directory/place-actions.ts (card list).
 * Server component. Only data the search returns is shown: no closing time exists in the search item, so none is invented.
 */
export function abbreviateCount(n:number,en:boolean){
 if(n<1000)return String(n);
 const v=Math.round(n/100)/10;
 const s=new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:1}).format(v);
 return en?`${s}K`:`${s} mil`;
}
const FOOD=new Set(['restaurant','cafe_bar']);
const BTN='relative z-10 inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#009FD9] px-5 text-[13.5px] font-bold text-white hover:bg-[#0089bb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';

export function PlaceResultRow({item,extra,rank,locale}:{item:PlaceSearchItem;extra:CardExtra|null;rank:number;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const href=`${en?'/en':''}/lugar/${item.slug}`;
 const photos=(extra?.photos??[]).slice(0,4);
 const rated=item.rating.count>0&&item.rating.average!=null;
 const avg=rated?Number(item.rating.average):0;
 const price=placePriceLevel(item.attributes);
 const area=item.address.adminArea3??item.address.adminArea2??null;
 const food=FOOD.has(item.vertical.id);
 const spec=placeActionSpec(item.vertical.id);
 const ids:PlaceActionId[]=food?['order',...spec.card]:spec.card;
 const actions=resolvePlaceActions(ids,{slug:item.slug,name:item.name,verticalId:item.vertical.id,locale,phone:item.phone,location:item.location});
 const first=actions[0];
 const label=!first?t('Contactar','Contact'):first.id==='call'&&food?t('Llamar para pedir','Call to order'):first.label;
 const independent=!item.attributes.brand&&!item.attributes.chain&&(item.verificationLevel==='claimed'||item.verificationLevel==='verified'||item.verificationLevel==='license_verified');
 const kind=kindLabel(item.vertical.id,item.attributes.kind,en);
 const chips=[...(food?placeCuisines(item.attributes).slice(0,2):[]),kind,en?item.vertical.nameEn:item.vertical.nameEs].filter((x,i,a):x is string=>!!x&&a.indexOf(x)===i).slice(0,2);
 const amenities=placeAmenities(item.attributes).filter(a=>a.key==='takeaway'||a.key==='delivery').map(a=>en?a.en:a.es);
 return <article data-search-item={item.key} data-place-row className="relative border-b border-[#eef2f6] py-4 text-[#162543]">
  {photos.length>0&&<ul className="scrollbar-none -mx-4 mb-3 flex snap-x scroll-pl-4 gap-2 overflow-x-auto px-4" data-row-photos aria-label={t('Fotos','Photos')}>
   {photos.map((p,i)=><li key={p} className="shrink-0 snap-start">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={placePhotoSrc(p,320)} alt="" loading={rank<=2&&i===0?'eager':'lazy'} className="h-[132px] w-[132px] rounded-2xl bg-[#EBF5FB] object-cover"/></li>)}
   <li className="shrink-0 snap-start"><a href={`${href}#fotos`} data-row-all-photos className="flex h-[132px] w-[132px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-[#EBF5FB] text-[13px] font-bold text-[#00688f]"><Camera className="h-5 w-5" aria-hidden="true"/>{t('Ver todas','See all')}</a></li>
  </ul>}
  <h3 className="text-[18px] font-extrabold leading-6"><a href={href} data-row-name className="after:absolute after:inset-0 after:z-0 after:content-['']">{rank}. {item.name}</a></h3>
  <div className="mt-1 flex items-center gap-1.5" data-row-rating>
   {rated?<>
    <span className="flex" aria-hidden="true">{[1,2,3,4,5].map(n=><Star key={n} className={`h-4 w-4 ${avg>=n-0.25?'fill-[#009FD9] text-[#009FD9]':'text-[#c5d2de]'}`}/>)}</span>
    <span className="text-[14px] font-bold">{new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(avg)}</span>
    <span className="text-[13.5px] text-[#5b6b82]">({abbreviateCount(item.rating.count,en)} {item.rating.count===1?t('reseña','review'):t('reseñas','reviews')})</span>
   </>:<span className="text-[13.5px] text-[#5b6b82]">{t('Sin reseñas todavía','No reviews yet')}</span>}
  </div>
  <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[14px] text-[#334155]" data-row-meta>
   <MapPin className="h-4 w-4 shrink-0 text-[#009FD9]" aria-hidden="true"/>
   <span className="truncate">{[area,price].filter(Boolean).join(' • ')}
    {item.open24h?<>{area||price?' • ':''}<b className="font-extrabold text-[#17803d]" data-open="24h">{t('Abierto 24 horas','Open 24 hours')}</b></>
     :item.openNow===true?<>{area||price?' • ':''}<b className="font-extrabold text-[#17803d]" data-open="now">{t('Abierto','Open')}</b></>
     :item.openNow===false?<>{area||price?' • ':''}<b className="font-extrabold text-[#c0392b]" data-open="closed">{t('Cerrado','Closed')}</b></>:null}
   </span>
  </p>
  {(independent||amenities.length>0)&&<div className="mt-2 flex flex-wrap items-start gap-1.5">
   {independent&&<InfoBadge label={t('Negocio local','Locally owned')} tip={t('Negocio reclamado por su dueño que no pertenece a una cadena.','Business claimed by its owner and not part of a chain.')}/>}
   {amenities.map(a=><span key={a} className="inline-flex min-h-7 items-center rounded-full bg-[#f4f7fa] px-2.5 text-[12px] font-semibold text-[#334155]">{a}</span>)}
  </div>}
  {extra?.snippet&&<div className="mt-2"><ReadMoreText text={extra.snippet} more={t('Leer más','Read more')} less={t('Leer menos','Read less')}/></div>}
  <div className="mt-3 flex items-center justify-between gap-3">
   <ul className="flex min-w-0 flex-wrap gap-1.5" data-row-chips>{chips.map(c=><li key={c} className="rounded-full border border-[#d7e1ea] px-3 py-1 text-[12.5px] font-semibold text-[#334155]">{c}</li>)}</ul>
   {first
    ?<ActionButton action={first} slug={item.slug} locale={locale} className={BTN} ariaLabel={label}>{actionIcon(first.id,'h-4 w-4 shrink-0')}{label}</ActionButton>
    :<a href={href} data-place-action="contact" className={BTN}>{label}</a>}
  </div>
 </article>;
}
