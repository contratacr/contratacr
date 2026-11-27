'use client';
import {useEffect,useState} from 'react';
import {Bookmark,Flag,ImagePlus,Link2,PenLine,Share2} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {MenuFicha,type OpcionFicha} from '@/components/ui/menu-ficha';
import {CaraCompartir,useCompartir} from '@/components/ui/boton-compartir';
import {PLACE_SAVED_EVENT,SaveToList} from './save-to-list';
import {PlacePhotoUpload} from './place-photo-upload';

const SAVE_OPEN='ccr:place-save-open',PHOTO_OPEN='ccr:place-photo-open';

/**
 * The sheet of the top bar's «…» on a place page (owner 2026-11-27: «las opciones dentro de … deberían ser iguales al
 * perfil profesional»): the shared MenuFicha in controlled mode, exactly like profile-client.tsx (same sheet, same rows,
 * Compartir with CaraCompartir: share sheet on touch, copy link with a mouse). Options: Guardar (filled when saved),
 * Compartir, Agregar fotos, Sugerir un cambio, Reportar (red). Guardar and Agregar fotos open the existing flows (lists
 * sheet, photo panel — owner/team photos publish at once, anyone else's wait for review); without an account they go to
 * the login first. Sugerir un cambio and Reportar open the page's report form (#reportar).
 */
export function PlaceFichaMenu({slug,name,locale,signedIn,loginHref,isManager}:{slug:string;name:string;locale:string;signedIn:boolean;loginHref:string|null;isManager:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const tMenu=useTranslations('menuFicha');
 const [open,setOpen]=useState(false),[saved,setSaved]=useState(false);
 const {compartir,avisoNodo}=useCompartir();
 useEffect(()=>{
  const onMenu=()=>setOpen(true);
  const onSaved=(e:Event)=>{const d=(e as CustomEvent<{slug:string;saved:boolean}>).detail;if(d?.slug===slug)setSaved(d.saved);};
  window.addEventListener('ccr:section-menu',onMenu);window.addEventListener(PLACE_SAVED_EVENT,onSaved);
  return()=>{window.removeEventListener('ccr:section-menu',onMenu);window.removeEventListener(PLACE_SAVED_EVENT,onSaved);};
 },[slug]);
 const toLogin=()=>window.location.assign(loginHref??'/login');
 // The report form sits at the end of «Información»: going to #reportar opens that tab (PlaceTabs) and the form.
 const openReport=()=>{if(window.location.hash==='#reportar')history.replaceState(null,'',window.location.pathname+window.location.search);
  window.location.replace('#reportar');};// replace: no history entry for an anchor inside the page
 const opciones:OpcionFicha[]=[
  {id:'guardar',icono:<Bookmark className={`h-4 w-4 ${saved?'fill-current text-[#0089bb]':''}`}/>,texto:saved?t('Guardado','Saved'):t('Guardar','Save'),onSelect:()=>signedIn?window.dispatchEvent(new Event(SAVE_OPEN)):toLogin()},
  {id:'compartir',icono:<CaraCompartir dedo={<Share2 className="h-4 w-4"/>} raton={<Link2 className="h-4 w-4"/>}/>,texto:<CaraCompartir dedo={tMenu('share')} raton={tMenu('copyLink')}/>,etiqueta:tMenu('share'),
   onSelect:()=>void compartir(`${en?'/en':''}/lugar/${slug}`,name)},
  {id:'fotos',icono:<ImagePlus className="h-4 w-4"/>,texto:t('Agregar fotos','Add photos'),onSelect:()=>signedIn?window.dispatchEvent(new Event(PHOTO_OPEN)):toLogin()},
  {id:'sugerir',icono:<PenLine className="h-4 w-4"/>,texto:t('Sugerir un cambio','Suggest an edit'),onSelect:openReport},
  {id:'reportar',icono:<Flag className="h-4 w-4"/>,texto:tMenu('report'),peligro:true,onSelect:openReport},
 ];
 return <div data-place-ficha-menu className="lg:hidden">
  <MenuFicha controlado={{abierto:open,onCambio:setOpen}} opciones={opciones}/>
  {/* The flows the sheet opens (no buttons of their own here; the chip row has them from lg). */}
  {signedIn&&<SaveToList slug={slug} locale={locale} signedIn loginHref={loginHref} hideButton openOn={SAVE_OPEN}/>}
  {signedIn&&<PlacePhotoUpload slug={slug} locale={locale} signedIn loginHref={loginHref} isManager={isManager} popover hideButton openOn={PHOTO_OPEN}/>}
  {avisoNodo}
 </div>;
}
