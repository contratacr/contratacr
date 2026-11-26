import {VERIFICATION_LABELS,type VerificationLevel} from '@/lib/directory/types';
import type {PlaceSearchItem,PlaceSearchPrice,RankingReason} from '@/lib/directory/search-schemas';
import {crDay,money,sourceLine} from '@/lib/directory/price-compare';
import {isHealthVertical,kindLabel,reviewsOn} from '@/lib/directory/place-verticals';
import {CalendarCheck,MapPin,Phone,Star} from 'lucide-react';
import type {ReactNode} from 'react';
import {openStatus,openStatusText} from '@/lib/directory/open-status';
import {mapLinks} from '@/lib/directory/place-actions';
import {WhatsAppLogo} from '@/components/ui/whatsapp-logo';
import {GoogleMapsIcon,WazeIcon} from '@/components/ui/nav-app-icons';
import {resolvePlaceAction} from '@/lib/directory/place-actions';
import {PlaceSaveBookmark} from './place-save-bookmark';
import {VerifiedSeal} from '@/components/ui/verified-seal';
import {RatingLine} from './biz-ui';
import {RESULT_CARD,ResultPhotoStrip,resultChip} from '@/components/search/result-card-parts';
import {placePriceLevel} from '@/lib/directory/place-amenities';
import {placePhotoSrc} from '@/lib/directory/place-photos';
import type {CardExtra} from '@/lib/directory/card-extras';

/**
 * LOCAL PRO ONLY (multivertical F6): result card of a place (restaurant, fuel station, pharmacy, supermarket,
 * agency). Server component. Status is given in text, never by colour alone; one tab stop per card (the name);
 * works at 390 px. REASON_LABELS stay for the assistant and any machine-readable use; they are not shown on cards.
 */
export const REASON_LABELS:Record<RankingReason,{es:string;en:string}>={
 text_exact:{es:'El nombre coincide con su búsqueda',en:'Name matches your search'},
 text_prefix:{es:'El nombre empieza con su búsqueda',en:'Name starts with your search'},
 text_word:{es:'El nombre contiene la palabra buscada',en:'Name contains the word you searched'},
 text_partial:{es:'El nombre contiene parte de su búsqueda',en:'Name contains part of your search'},
 text_keyword:{es:'Coincide con la categoría, marca o zona',en:'Matches the category, brand or area'},
 locality_district:{es:'Está en el distrito elegido',en:'In the chosen district'},
 locality_canton:{es:'Está en el cantón elegido',en:'In the chosen canton'},
 locality_province:{es:'Está en la provincia elegida',en:'In the chosen province'},
 rating_credible:{es:'Tiene calificaciones de varios clientes',en:'Rated by several customers'},
 verified:{es:'Verificado por ContrataCR',en:'Verified by ContrataCR'},
 profile_complete:{es:'Ficha completa',en:'Complete listing'},
 fresh_listing:{es:'Publicado recientemente',en:'Recently published'},
 distance:{es:'Ordenado por cercanía',en:'Sorted by distance'},
 price_asc:{es:'Ordenado por precio, de menor a mayor',en:'Sorted by price, low to high'},
 price_desc:{es:'Ordenado por precio, de mayor a menor',en:'Sorted by price, high to low'},
 price_missing:{es:'Sin precio publicado',en:'No published price'},
 newest:{es:'Ordenado por fecha de publicación',en:'Sorted by date published'},
 sort_rating:{es:'Ordenado por calificación',en:'Sorted by rating'},
 id_tiebreak:{es:'Empate resuelto de forma fija',en:'Tie resolved in a fixed order'},
};

export function formatDistance(km:number|null,en:boolean){
 if(km==null)return null;
 const n=new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:km<10?1:0}).format(km);
 return en?`${n} km away`:`a ${n} km`;
}

/**
 * Permit status of a pharmacy (owner decision 2026-11-17: every pharmacy is shown). Verified → badge; otherwise a
 * neutral note, never an alarm: ContrataCR simply has not checked the permit yet.
 */
export function pharmacyLicence(level:string,en:boolean){
 return level==='license_verified'
  ?{state:'verified' as const,text:en?'Operating license verified':'Permiso de funcionamiento verificado'}
  :{state:'unverified' as const,text:en?'License not verified by ContrataCR':'Permiso sin verificar por ContrataCR'};
}

/**
 * Permit line of a health or vet place (2026-11-17 sections; same pattern as pharmacies, requires_license=false):
 * verified → badge; otherwise the neutral «Habilitación sin verificar por ContrataCR», never an alarm.
 */
export function healthPermit(level:string,en:boolean){
 return level==='license_verified'
  ?{state:'verified' as const,text:en?'Health permit verified by ContrataCR':'Habilitación verificada por ContrataCR'}
  :{state:'unverified' as const,text:en?'Permit not verified by ContrataCR':'Habilitación sin verificar por ContrataCR'};
}

/** Price line of a card: amount + what it is + source and date (Ley 7472: source and date always visible). */
export function PlacePriceLine({price,en}:{price:PlaceSearchPrice;en:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 if(price.kind==='menu')return <p className="text-[12px] leading-snug text-[#6b7280]" data-place-price="menu" data-price-amount={price.amount}>
  <span className="text-[13px] font-bold text-[#009FD9]">{t('Precio típico','Typical price')} {money(price.amount,price.currency,en)}</span>
  {' · '}{t(`${price.dishes} ${price.dishes===1?'plato':'platos'} del menú, con IVA y servicio`,`${price.dishes} ${price.dishes===1?'dish':'dishes'} on the menu, VAT and service included`)} · {t('actualizado el ','updated on ')}{crDay(price.updatedAt,en)}</p>;
 const o=price.observation;
 return <p className="text-[12px] leading-snug text-[#6b7280]" data-place-price="product" data-price-amount={o.price}>
  <span className="text-[13px] font-bold text-[#009FD9]">{price.item.name}{price.item.presentation?` (${price.item.presentation})`:''}: {money(o.price,o.currency,en)}</span>
  {' · '}{sourceLine(o,en)}</p>;
}

const VERIFIED=new Set(['verified','license_verified']);
// Quick action chip on result cards (Google Maps style): outline, icon + one word, 32px.
export const CHIP='inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#eaf7fd] px-3 text-[12.5px] font-bold text-[#0083b0] transition-colors hover:bg-[#d9f0fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]';
/** Maps-like status line shared by the card and the place page: «Abierto · cierra a las 21:00», «Cerrado · abre…». */
export function PlaceStatusLine({status,className='',children,...rest}:{status:{label:string;detail:string|null;open:boolean};className?:string;children?:ReactNode}&Record<`data-${string}`,string|undefined>){
 return <p className={`font-semibold leading-snug ${className}`} data-open={status.open?'open':'closed'} {...rest}>
  <span className={status.open?'text-[#047857]':'text-[#b91c1c]'}>{status.label.replace(/ ahora$/,'').replace(/ now$/,'')}</span>
  {status.detail&&<span className="text-[#526277]"> · {status.detail}</span>}{children}</p>;
}
const DAYS_ES=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'] as const,DAYS_EN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] as const;

/**
 * Result card of a place, same anatomy as ProfessionalCard (one visual system, owner decision 2026-11-21): round photo (first approved one) or
 * section tile on the left, 52/64 px, photos 2-4 as a strip under the info, carrying the navy rank badge that mirrors its map pin, name + verified seal with the price
 * level on the right of the name line, tags, rating («5.0 7 reseñas»), location, status chips, and in the right column
 * (below the info on phones) the action pills: «Llamar» takes the place WhatsApp has for professionals, «Cómo llegar»
 * the place of «Contactar por llamada». The whole card opens the place page (stretched low-z link); the name link is the
 * one tab stop. Ranking reasons stay machine-readable in `data-ranking-reasons` (/como-ordenamos and the Terms).
 */
export function PlaceCard({item,locale,headingLevel=3,rank,extra}:{item:PlaceSearchItem;locale:string;headingLevel?:2|3;rank?:number;extra?:CardExtra|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const H=headingLevel===2?'h2':'h3';
 const href=`${en?'/en':''}/lugar/${item.slug}`;
 const area=[item.address.adminArea3,item.address.adminArea2,item.address.adminArea1].filter(Boolean).join(', ');
 const distance=formatDistance(item.distanceKm,en);
 const level=item.verificationLevel as VerificationLevel;
 const brand=typeof item.attributes.brand==='string'?item.attributes.brand:typeof item.attributes.chain==='string'?item.attributes.chain:null;
 const kind=kindLabel(item.vertical.id,item.attributes.kind,en),health=isHealthVertical(item.vertical.id);
 const verified=VERIFIED.has(level);
 // Owner tools (reservations, WhatsApp order link) only count on claimed places, like the place page.
 const claimed=level==='claimed'||verified;
 const actionInput={slug:item.slug,name:item.name,verticalId:item.vertical.id,locale,phone:item.phone,location:item.location};
 const priceLevel=placePriceLevel(item.attributes);
 const permit=item.vertical.id==='pharmacy'?{...pharmacyLicence(item.verificationLevel,en),attr:'data-pharmacy-license'}:health?{...healthPermit(item.verificationLevel,en),attr:'data-health-permit'}:null;
 // No reviews at all for public offices, malls, schools and terminals (owner 2026-11-26): no rating, no «Reseñar».
 const reviews=reviewsOn(item.vertical.id,item.attributes.kind);
 const rated=reviews&&item.rating.count>0&&item.rating.average!=null;
 const tags=[en?item.vertical.nameEn:item.vertical.nameEs,kind,brand].filter(Boolean) as string[];
 // Maps-like status line (owner 2026-11-26): «Abierto · cierra a las 21:00», «Abierto 24 horas», «Cerrado · abre mañana…».
 const status=extra?.hours?.length?openStatus(extra.hours):null;
 const statusText=status?openStatusText(status,en,en?DAYS_EN:DAYS_ES):item.open24h?{label:t('Abierto 24 horas','Open 24 hours'),detail:null,open:true}
  :item.openNow===true?{label:t('Abierto ahora','Open now'),detail:null,open:true}:item.openNow===false?{label:t('Cerrado','Closed'),detail:null,open:false}:null;
 // Every action this place has, in this order (Reservar, Reseñar, WhatsApp, Llamar, Waze, Maps), each with its own icon and in the ContrataCR colours.
 const maps=item.location?mapLinks(item.location.lat,item.location.lng):null;
 const wa=claimed&&extra?.whatsapp?`https://wa.me/${extra.whatsapp.replace(/[^0-9]/g,'').replace(/^(\d{8})$/,'506$1')}`:null;
 const call=resolvePlaceAction('call',actionInput);
 const actions:{id:string;label:string;href:string;icon:ReactNode;external?:boolean}[]=[
  ...(claimed&&extra?.reservation?[{id:'reserve',label:t('Reservar','Reserve'),href:`${href}#place-reservations`,icon:<CalendarCheck className="h-4 w-4 shrink-0" aria-hidden="true"/>}]:[]),
  ...(reviews?[{id:'review',label:t('Reseñar','Review'),href:`${href}#escribir-resena`,icon:<Star className="h-4 w-4 shrink-0" aria-hidden="true"/>}]:[]),
  ...(wa?[{id:'whatsapp',label:'WhatsApp',href:wa,icon:<WhatsAppLogo className="h-4 w-4 shrink-0"/>,external:true}]:[]),
  ...(call?[{id:'call',label:t('Llamar','Call'),href:call.href,icon:<Phone className="h-4 w-4 shrink-0" aria-hidden="true"/>}]:[]),
  ...(maps?[{id:'waze',label:'Waze',href:maps.waze,icon:<WazeIcon className="h-4 w-4 shrink-0"/>,external:true},{id:'maps',label:'Maps',href:maps.google,icon:<GoogleMapsIcon className="h-4 w-4 shrink-0"/>,external:true}]:[]),
 ];
 const photos=(extra?.photos??[]).slice(0,4).map(u=>placePhotoSrc(u,320));
 return <article data-search-item={item.key} data-ranking-reasons={item.ranking_reason.join(' ')}
  className={`${RESULT_CARD} relative flex flex-col gap-1 text-[#162543]`}>
  {/* Save, top right (out of the name row so it adds no height). */}
  <PlaceSaveBookmark slug={item.slug} name={item.name} locale={locale} className="!absolute right-2 top-2"/>
  <H className="min-w-0 pr-9 text-[15px] font-bold leading-[1.2] text-[#111827]">
   <a className="relative z-10 break-words transition-colors hover:text-[#009FD9] focus-visible:underline" href={href}>{rank!=null?`${rank}. `:''}{item.name}</a>
   {verified&&<VerifiedSeal className="ml-1 inline h-4 w-4 -translate-y-px align-middle" label={VERIFICATION_LABELS[level][en?'en':'es']}/>}
   {priceLevel&&<span className="ml-1.5 text-[13px] font-bold text-[#009FD9]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span>}
  </H>
  <p className="truncate text-[12.5px] font-semibold leading-snug text-[#6b7280]" data-place-tags>{tags.map((x,i)=>i===1&&kind?<span key={x} data-place-kind={String(item.attributes.kind)}>{i?' · ':''}{x}</span>:<span key={x}>{i?' · ':''}{x}</span>)}</p>
  {/* Photos the owner or the reviewers added go right under the name (owner 2026-11-26). */}
  {photos.length>0&&<ResultPhotoStrip className="mt-1" photos={photos}/>}
  {rated&&<div data-place-rating><RatingLine average={Number(item.rating.average)} count={item.rating.count} en={en} compact/></div>}
  {statusText&&<PlaceStatusLine status={statusText} className="text-[12.5px]"/>}
  {(area||distance)&&<p className="flex min-w-0 items-center gap-1 text-[12.5px] font-medium text-[#68778d]"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
   <span className="truncate">{area}{area&&distance?' · ':''}{distance}</span></p>}
  {(permit||item.attributes.publicService===true||level==='claimed')&&<ul className="mt-0.5 flex flex-wrap items-center gap-1.5" aria-label={t('Datos del lugar','Place details')}>
   {permit&&<li {...{[permit.attr]:permit.state}} className={`${resultChip(permit.state==='verified'?'ok':'neutral')}`}>{permit.text}</li>}
   {item.attributes.publicService===true&&<li className={`${resultChip('neutral')}`} data-public-service>{t('Servicio público','Public service')}</li>}
   {level==='claimed'&&<li className={`${resultChip('brand')}`} data-place-claimed>{VERIFICATION_LABELS.claimed[en?'en':'es']}</li>}
  </ul>}
  {item.price&&<PlacePriceLine price={item.price} en={en}/>}
  <div className="scrollbar-none relative z-10 -mx-1 mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [touch-action:pan-x_pan-y]" data-place-quick-actions={actions.map(a=>a.id).join(' ')}>
   {actions.map(a=><a key={a.id} href={a.href} data-place-action={a.id} className={`${CHIP} relative z-10`} {...(a.external?{target:'_blank',rel:'noopener noreferrer'}:{})}>{a.icon}{a.label}</a>)}
  </div>
  {/* Whole card → the place page (stretched low-z overlay); the name link is the focusable one. */}
  <a href={href} className="absolute inset-0 z-0" tabIndex={-1} aria-hidden="true"/>
 </article>;
}
