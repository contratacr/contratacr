'use client';
import {useState} from 'react';
import {Camera,ExternalLink,Globe,MapPin,UtensilsCrossed} from 'lucide-react';
import {FacebookIcon,InstagramIcon} from '@/components/icons/social-icons';
import {menuLinkLabel,type MenuLink} from '@/lib/directory/place-menu-link';
import {PlacePhotoGallery,type GalleryPhoto} from './place-photo-gallery';
import {PlacePhotoUpload} from './place-photo-upload';
import {PHOTO_CATEGORIES,menuPhotosFor,photoCategoryLabel,type PhotoCategory} from '@/lib/directory/place-photos';
import {BIZ,ring} from './biz-ui';

/**
 * «Fotos» tab of a place (547, 2026-11-27, owner: «que la gente suba fotos y comentarios», Google Maps / Yelp model).
 * Filter chips by what the photos show (Todas + only the categories that have photos), the gallery, and the invitation
 * to add photos: «Sea el primero en agregar fotos» when there are none, «Agregar foto del menú» in food places without
 * menu photos. The upload panel opens inline here (the «…» sheet's panel is phones-only), so it works on every width.
 */
type Viewer={signedIn:boolean;loginHref:string|null;isManager:boolean};
export function PlacePhotosTab({photos,placeName,slug,vertical,locale,viewer}:{photos:GalleryPhoto[];placeName:string;slug:string;vertical:string;locale:string;viewer:Viewer}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [filter,setFilter]=useState<PhotoCategory|'all'>('all');
 const present=PHOTO_CATEGORIES.filter(c=>photos.some(p=>p.category===c)&&(c!=='menu'||menuPhotosFor(vertical)));
 const shown=filter==='all'?photos:photos.filter(p=>p.category===filter);
 const food=menuPhotosFor(vertical),hasMenuPhotos=photos.some(p=>p.category==='menu');
 const chip=(active:boolean)=>`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${ring} ${active?'border-[#162543] bg-[#162543] text-white':'border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#F7FAFC]'}`;
 const upload=(category:PhotoCategory|undefined,label:string,primary:boolean)=><PlacePhotoUpload slug={slug} locale={locale} signedIn={viewer.signedIn} loginHref={viewer.loginHref} isManager={viewer.isManager}
  vertical={vertical} category={category} label={label}
  buttonClass={primary?`inline-flex min-h-11 items-center gap-2 rounded-full bg-[#162543] px-5 text-sm font-semibold text-white hover:bg-[#1f3258] ${ring}`:undefined}/>;
 return <section id="fotos" aria-labelledby="place-photos" data-place-photos={photos.length} className="scroll-mt-32 space-y-4">
  <h2 id="place-photos" className={BIZ.h2}>{t('Fotos','Photos')} {photos.length>0&&<span className="font-semibold text-[#94a3b8]">{photos.length}</span>}</h2>
  {photos.length===0?<div className="space-y-3 rounded-2xl border border-dashed border-[#c9d6e2] bg-[#f7fafc] p-5" data-place-photos-empty>
   <p className="flex items-start gap-2 font-semibold text-[#162543]"><Camera aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#0083b0]"/>{t('Sea el primero en agregar fotos','Be the first to add photos')}</p>
   <p className="text-sm text-[#526277]">{food?t('Una foto del menú, de la comida o del local ayuda a otras personas a decidir.','A photo of the menu, the food or the place helps other people decide.')
    :t('Una foto del local, de la entrada o de lo que ofrece ayuda a otras personas a decidir.','A photo of the place, the entrance or what it offers helps other people decide.')}</p>
   <div className="flex flex-wrap gap-2" data-place-photos-cta>{upload(undefined,t('Agregar fotos','Add photos'),true)}{food&&upload('menu',t('Agregar foto del menú','Add a menu photo'),false)}</div>
  </div>:<>
   {present.length>1&&<div role="group" aria-label={t('Filtrar fotos','Filter photos')} className="flex flex-wrap gap-2" data-place-photo-filters>
    <button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')} className={chip(filter==='all')} data-place-photo-filter="all">{t('Todas','All')} ({photos.length})</button>
    {present.map(c=><button key={c} type="button" aria-pressed={filter===c} onClick={()=>setFilter(c)} className={chip(filter===c)} data-place-photo-filter={c}>
     {photoCategoryLabel(c,vertical,en)} ({photos.filter(p=>p.category===c).length})</button>)}
   </div>}
   {/* key: the gallery restarts (lightbox index, card groups) when the filter changes. */}
   <PlacePhotoGallery key={filter} en={en} placeName={placeName} photos={shown} variant={shown.length>1?'cases':'grid'}/>
   <div className="flex flex-wrap gap-2" data-place-photos-cta>{upload(undefined,t('Agregar fotos','Add photos'),false)}
    {food&&!hasMenuPhotos&&upload('menu',t('Agregar foto del menú','Add a menu photo'),false)}</div>
  </>}
 </section>;
}

/** «Menú (fotos de clientes)»: the approved menu photos of a restaurant/café, in the «Menú» tab (with or without a typed menu). */
export function PlaceMenuPhotos({photos,placeName,slug,vertical,locale,viewer}:{photos:GalleryPhoto[];placeName:string;slug:string;vertical:string;locale:string;viewer:Viewer}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 return <section aria-labelledby="place-menu-photos" className="space-y-3" data-place-menu-photos={photos.length}>
  <h2 id="place-menu-photos" className={`${BIZ.h2} flex items-center gap-2`}><UtensilsCrossed aria-hidden="true" className="h-5 w-5 shrink-0 text-[#0083b0]"/>{t('Menú (fotos de clientes)','Menu (customer photos)')}</h2>
  <p className="text-sm text-[#526277]">{t('Fotos del menú que agregaron los clientes. Los precios pueden haber cambiado; confírmelos con el negocio.','Menu photos added by customers. Prices may have changed; confirm them with the business.')}</p>
  <PlacePhotoGallery en={en} placeName={placeName} photos={photos} variant={photos.length>1?'cases':'grid'}/>
  <PlacePhotoUpload slug={slug} locale={locale} signedIn={viewer.signedIn} loginHref={viewer.loginHref} isManager={viewer.isManager} vertical={vertical} category="menu" label={t('Agregar foto del menú','Add a menu photo')}/>
 </section>;
}

/** «Ver menú» fallback (owner 2026-11-27): only while ContrataCR has no menu for the place (no typed menu, no approved
 *  menu photos). Link only, new tab, rel noopener noreferrer nofollow; plus «Agregar foto del menú» and, for the
 *  business, «Suba su menú». See src/lib/directory/place-menu-link.ts for the source order. */
export function PlaceMenuFallback({link,slug,vertical,locale,viewer,manageHref}:{link:MenuLink;slug:string;vertical:string;locale:string;viewer:Viewer;manageHref:string|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prices=link.kind==='prices';
 const Icon=link.source==='instagram'?InstagramIcon:link.source==='facebook'?FacebookIcon:link.source==='maps'?MapPin:Globe;
 return <section aria-labelledby="place-menu-fallback" className="space-y-3 rounded-2xl border border-[#e5e9ee] bg-white p-4" data-place-menu-fallback={link.source}>
  <h2 id="place-menu-fallback" className={BIZ.h2}>{prices?t('Precios','Prices'):t('Menú','Menu')}</h2>
  <p className="text-sm text-[#526277]">{prices?t('Este negocio aún no tiene su lista de precios en ContrataCR.','This business does not have its price list on ContrataCR yet.')
   :t('Este negocio aún no tiene su menú en ContrataCR.','This business does not have its menu on ContrataCR yet.')}</p>
  <div className="flex flex-wrap gap-2">
   <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" data-place-menu-external className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-[#162543] px-5 py-2 text-left text-sm font-semibold text-white hover:bg-[#1f3258] ${ring}`}>
    <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/><span>{menuLinkLabel(link,en)}</span><ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-80"/></a>
   {!prices&&!viewer.isManager&&<PlacePhotoUpload slug={slug} locale={locale} signedIn={viewer.signedIn} loginHref={viewer.loginHref} isManager={false} vertical={vertical} category="menu" label={t('Agregar foto del menú','Add a menu photo')}/>}
   {manageHref&&<a href={manageHref} data-place-menu-owner className={`inline-flex min-h-11 items-center rounded-full border border-[#162543] px-5 text-sm font-semibold text-[#162543] hover:bg-[#F7FAFC] ${ring}`}>{prices?t('Suba sus precios','Upload your prices'):t('Suba su menú','Upload your menu')}</a>}
  </div>
  <p className="text-xs text-[#68778d]">{t('Se abre en otro sitio. ContrataCR no controla ese contenido.','Opens on another site. ContrataCR does not control that content.')}</p>
 </section>;
}
