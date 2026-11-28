'use client';
import {useEffect,useRef,useState} from 'react';
import {Bell,Briefcase,Bookmark,Building2,Calendar,Camera,ChevronRight,FileText,HelpCircle,LayoutDashboard,LogOut,MapPinCheck,MessageSquareText,Plus,QrCode,Share2,ShieldCheck,Star,Tag,Users,X,Activity,Lock,Image as ImageIcon,Store} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {useAvisosPorVer} from '@/hooks/use-avisos-por-ver';
import {useDirectMessageUnread} from '@/hooks/use-direct-message-unread';
import {createClient} from '@/lib/supabase/client';
import {signOutToHome} from '@/lib/auth/sign-out';
import {PROFILE_IMAGE_OPTIONS,prepareImageForUpload,uploadPhotoFormDataWithRetry} from '@/lib/client-image-upload';
import {AvatarFileInput} from '@/components/ui/avatar-file-input';
import {MeShareSheet,tryNativeShare} from '@/components/account/me-share-sheet';
import {MeQrSheet} from '@/components/account/me-qr-sheet';
import {SaveToList} from '@/components/directory/save-to-list';
import {answerExperience,dismissExperience,readDismissed,readViewedPlaces,type ViewedPlace} from '@/components/saved/recently-viewed';
import {refreshBeenHereCount} from '@/components/saved/lists-client';

/**
 * «Yo» (Mi cuenta): the Me tab. Sections in order: icon buttons (bell, share, QR), avatar + counters, quick actions,
 * «Comparta su experiencia», «Impacto», «Vistos recientemente», «Contribuciones», «Comunidad», «Más en ContrataCR», «Mi cuenta».
 * Counters that the server could not read arrive as null and are hidden instead of faked.
 */
export type MeCounts={reviews:number|null;photos:number|null;added:number|null};
/** 547: the person's latest place photos for «Impacto · Fotos» (approved ones are served by the photo route; a pending or
 *  refused one is a text row, since the route serves only approved photos). */
export type MePhoto={id:string;status:'approved'|'pending'|'rejected'|'hidden';placeName:string;slug:string};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const h2='mt-8 mb-3 text-xl font-extrabold text-[#162543]';
function Badge({n}:{n:number}){return n>0?<span className="ml-auto mr-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1.5 text-xs font-bold text-white">{n>9?'9+':n}</span>:null;}
function Row({href,icon:Icon,label,right,onClick,danger}:{href?:string;icon:typeof Bell;label:string;right?:React.ReactNode;onClick?:()=>void;danger?:boolean}){
 const cls=`flex min-h-14 w-full items-center gap-3 border-b border-[#eef2f6] py-2 text-left ${ring} ${danger?'text-red-700':'text-[#162543]'}`;
 const inner=<><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef5f9]"><Icon aria-hidden="true" className="h-[18px] w-[18px]"/></span><span className="flex-1 font-semibold">{label}</span>{right}{!danger&&<ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400"/>}</>;
 return href?<a href={href} className={cls}>{inner}</a>:<button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
function Thumb({name,image}:{name:string;image?:string}){
 return image?/* eslint-disable-next-line @next/next/no-img-element -- remembered thumbnail */<img src={image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover"/>
  :<span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#eaf6fb] text-lg font-extrabold text-[#0089bb]">{name.trim().charAt(0).toUpperCase()}</span>;
}

export function MeHome({locale,name,counts,isPro,empleos,shareUrl,dashboardHref,beenCount,myPhotos=[]}:{myPhotos?:MePhoto[];locale:string;name:string;counts:MeCounts;isPro:boolean;empleos:boolean;shareUrl:string;dashboardHref:string;beenCount:number|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const {user,avatarUrl}=useAuth();
 const avisos=useAvisosPorVer(true),mensajes=useDirectMessageUnread(true);
 const [shareOpen,setShareOpen]=useState(false),[qrOpen,setQrOpen]=useState(false),[recent,setRecent]=useState<ViewedPlace[]>([]),[dismissed,setDismissed]=useState<string[]>([]);
 const [impact,setImpact]=useState<'reviews'|'photos'>('reviews'),[photo,setPhoto]=useState<string|null>(null),[uploadError,setUploadError]=useState(false),[visits,setVisits]=useState(beenCount);
 const fileRef=useRef<HTMLInputElement>(null);
 // localStorage only exists in the browser, so it is read after mount.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{setRecent(readViewedPlaces());setDismissed(readDismissed());void refreshBeenHereCount().then(n=>{if(n!==null)setVisits(n);});},[]);
 const shownAvatar=photo??avatarUrl;
 const cards=recent.filter(p=>!dismissed.includes(p.slug)).slice(0,3);
 const share=async()=>{if(!(await tryNativeShare(shareUrl,'ContrataCR',t('Descubra negocios y profesionales en ContrataCR.','Discover businesses and professionals on ContrataCR.'))))setShareOpen(true);};
 const upload=async(file:File)=>{
  if(!user)return;setUploadError(false);
  try{
   const prepared=await prepareImageForUpload(file,PROFILE_IMAGE_OPTIONS),fd=new FormData();fd.append('file',prepared);fd.append('type','avatar');
   const up=await uploadPhotoFormDataWithRetry(fd);if(!up.ok||!up.data.url)throw new Error('upload');
   const supabase=createClient(),url=up.data.url;
   const a=await supabase.from('profiles').update({avatar_url:url}).eq('id',user.id),b=await supabase.auth.updateUser({data:{avatar_url:url}});
   if(a.error||b.error)throw new Error('profile');setPhoto(url);
  }catch{setUploadError(true);}
 };
 const counter=(Icon:typeof Star,n:number|null,label:string)=>n===null?null:<li className="flex items-center gap-1.5 text-sm text-slate-700"><Icon aria-hidden="true" className="h-4 w-4"/><span className="font-bold text-[#162543]">{n}</span><span className="sr-only">{label}</span></li>;
 const listsHref=`${prefix}/dashboard/profesional?tab=saved&vista=listas`;
 const quick=[{href:`${prefix}/buscar?resena=1`,icon:Star,label:t('Agregar reseña','Add review')},{href:`${prefix}/buscar?foto=1`,icon:Camera,label:t('Agregar foto','Add photo')},
  {href:listsHref,icon:MapPinCheck,label:t('Registrar visita','Check in')},{href:`${prefix}/registro/profesional`,icon:Store,label:t('Agregar negocio','Add business')}];
 // «Mis listas» lives inside «Mi panel» (owner, 2026-11-27); «Yo» is only shown with a session.
 const iconBtn=`relative grid h-11 w-11 place-items-center rounded-full border border-[#d7e1ea] bg-white text-[#162543] ${ring}`;
 const exp=(slug:string,a:'yes'|'no'|'maybe')=>{answerExperience(slug,a);setDismissed(readDismissed().concat(slug));};
 const reviewsN=counts.reviews;
 return <div data-me-home className="mx-auto max-w-2xl px-4 pb-24 pt-4 text-[#162543]">
  <div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">{t('Yo','Me')}</h1>
   <div className="flex gap-2">
    <a href={`${prefix}/notificaciones`} aria-label={avisos>0?`${t('Notificaciones','Notifications')}: ${avisos}`:t('Notificaciones','Notifications')} data-me-bell className={iconBtn}><Bell aria-hidden="true" className="h-5 w-5"/>
     {avisos>0&&<span data-me-bell-badge className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1 text-[11px] font-bold text-white">{avisos>9?'9+':avisos}</span>}</a>
    <button type="button" aria-label={t('Compartir','Share')} data-me-share onClick={share} className={iconBtn}><Share2 aria-hidden="true" className="h-5 w-5"/></button>
    <button type="button" aria-label={t('Código QR','QR code')} data-me-qr onClick={()=>setQrOpen(true)} className={iconBtn}><QrCode aria-hidden="true" className="h-5 w-5"/></button></div></div>

  <section className="mt-5 flex items-center gap-4" aria-label={t('Perfil','Profile')}>
   <button type="button" aria-label={t('Cambiar foto de perfil','Change profile photo')} onClick={()=>fileRef.current?.click()} className={`relative h-20 w-20 shrink-0 rounded-full ${ring}`}>
    {shownAvatar?/* eslint-disable-next-line @next/next/no-img-element -- avatar */<img src={shownAvatar} alt="" className="h-20 w-20 rounded-full object-cover"/>
     :<span className="grid h-20 w-20 place-items-center rounded-full bg-[#eef5f9] text-[#52627a]"><Camera aria-hidden="true" className="h-8 w-8"/></span>}
    <span aria-hidden="true" className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#009FD9] text-white"><Plus className="h-4 w-4"/></span></button>
   <AvatarFileInput ref={fileRef} className="hidden" onFile={upload}/>
   <div className="min-w-0"><p data-me-name className="truncate text-xl font-extrabold">{name}</p>
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1" data-me-counters>{counter(Star,reviewsN,t('reseñas','reviews'))}{counter(MapPinCheck,visits,t('visitas','visits'))}{counter(ImageIcon,counts.photos,t('fotos','photos'))}</ul></div></section>
  {uploadError&&<p role="alert" className="mt-2 text-sm font-semibold text-red-800">{t('No se pudo subir la foto. Intente de nuevo.','The photo could not be uploaded. Please try again.')}</p>}

  <nav aria-label={t('Acciones rápidas','Quick actions')} data-me-quick className="mt-5 grid grid-cols-4 gap-2">
   {quick.map(q=><a key={q.href} href={q.href} className={`flex flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center text-xs font-semibold ${ring}`}>
    <span className="grid h-12 w-12 place-items-center rounded-full bg-[#eaf6fb] text-[#0089bb]"><q.icon aria-hidden="true" className="h-5 w-5"/></span>{q.label}</a>)}</nav>

  {cards.length>0&&<section data-me-experience aria-labelledby="me-exp"><h2 id="me-exp" className={h2}>{t('Comparta su experiencia','Share your experience')}</h2>
   <ul className="space-y-3">{cards.map(p=><li key={p.slug} data-experience-card={p.slug} className="relative rounded-2xl border border-[#d7e1ea] p-4">
    <button type="button" aria-label={`${t('Descartar','Dismiss')}: ${p.name}`} onClick={()=>{dismissExperience(p.slug);setDismissed(readDismissed().concat(p.slug));}} className={`absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 ${ring}`}><X aria-hidden="true" className="h-4 w-4"/></button>
    <div className="flex items-center gap-3 pr-8"><Thumb name={p.name} image={p.image}/><div className="min-w-0"><p className="truncate font-bold">{p.name}</p><p className="text-sm text-slate-700">{t('¿Recomienda este negocio?','Do you recommend this business?')}</p></div></div>
    <div className="mt-3 flex gap-2">{([['yes',t('Sí','Yes')],['no','No'],['maybe',t('Tal vez','Maybe')]] as const).map(([k,label])=><a key={k} href={`${prefix}/negocios/${p.slug}?recomienda=${k}#resenas`} onClick={()=>exp(p.slug,k)} className={`flex min-h-11 flex-1 items-center justify-center rounded-full border border-[#d7e1ea] px-3 text-sm font-bold ${ring}`}>{label}</a>)}</div></li>)}</ul></section>}

  <section data-me-impact aria-labelledby="me-impact"><h2 id="me-impact" className={h2}>{t('Impacto','Impact')}</h2>
   <div role="tablist" className="flex border-b border-[#e3eaf1]">{(['reviews','photos'] as const).map(k=><button key={k} role="tab" type="button" aria-selected={impact===k} onClick={()=>setImpact(k)} className={`flex-1 border-b-2 py-3 text-sm font-bold ${ring} ${impact===k?'border-[#009FD9]':'border-transparent text-slate-600'}`}>{k==='reviews'?t('Reseñas','Reviews'):t('Fotos','Photos')}</button>)}</div>
   {impact==='photos'&&myPhotos.length>0?<ul className="mt-3 divide-y divide-[#eef2f6]" data-me-photos={myPhotos.length}>{myPhotos.map(p=><li key={p.id} className="flex items-center gap-3 py-3" data-me-photo={p.status}>
    {p.status==='approved'?/* eslint-disable-next-line @next/next/no-img-element -- own approved place photo (same-origin route) */<img src={`/api/fotos-lugar/${p.id}?s=320`} alt="" draggable={false} className="h-14 w-14 shrink-0 rounded-xl object-cover"/>
     :<span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#eef3f8] text-[#68778d]"><ImageIcon className="h-5 w-5"/></span>}
    <a href={`${prefix}/negocios/${p.slug}#fotos`} className={`min-w-0 flex-1 ${ring}`}><span className="block font-bold [overflow-wrap:anywhere]">{p.placeName}</span>
     <span className="block text-sm text-slate-600">{p.status==='approved'?t('Publicada','Published'):p.status==='pending'?t('Pendiente de revisión','Awaiting review'):t('No publicada','Not published')}</span></a></li>)}</ul>
   :<>
   <div className="mt-4 grid grid-cols-2 gap-3">{[[0,t('reacciones en total','reactions all time')],[0,t('vistas últimos 90 días','views last 90 days')]].map(([n,l])=><div key={String(l)} className="rounded-2xl bg-[#f1f6fa] p-4"><p className="text-2xl font-extrabold">{n}</p><p className="text-sm text-slate-700">{l}</p></div>)}</div>
   <p className="mt-4 text-center text-slate-700">{impact==='reviews'?t('¡Las reacciones lo esperan! Escriba su primera reseña para ayudar a otros a descubrir un negocio.','Reactions await! Write your first review to help others discover a business.'):t('¡Las reacciones lo esperan! Agregue su primera foto para ayudar a otros a descubrir un negocio.','Reactions await! Add your first photo to help others discover a business.')}</p>
   <a href={`${prefix}/buscar?resena=1`} className={`mt-3 flex min-h-12 w-full items-center justify-center rounded-full bg-[#e6ecf2] px-4 font-bold ${ring}`}>{impact==='reviews'?t('Escribir una reseña','Write a review'):t('Agregar una foto','Add a photo')}</a></>}</section>

  {recent.length>0&&<section data-me-recent aria-labelledby="me-recent"><h2 id="me-recent" className={h2}>{t('Vistos recientemente','Recently viewed')}</h2>
   <ul className="divide-y divide-[#eef2f6]">{recent.slice(0,5).map(p=><li key={p.slug} className="flex items-center gap-3 py-3"><Thumb name={p.name} image={p.image}/>
    <a href={`${prefix}/negocios/${p.slug}`} className={`min-w-0 flex-1 ${ring}`}><span className="block truncate font-bold">{p.name}</span>{p.area&&<span className="block truncate text-sm text-slate-600">{p.area}</span>}</a>
    <SaveToList slug={p.slug} locale={locale} signedIn loginHref={null} name={p.name} area={p.area} image={p.image} variant="icon"/></li>)}</ul></section>}

  <section data-me-contrib aria-labelledby="me-contrib"><h2 id="me-contrib" className={h2}>{t('Contribuciones','Contributions')}</h2>
   <Row href={`${prefix}/buscar?resena=1`} icon={Star} label={t('Reseñas','Reviews')} right={<span className="ml-auto mr-1 text-slate-600">{reviewsN??0}</span>}/>
   <Row href={`${prefix}/lugares`} icon={MessageSquareText} label={t('Conversaciones de la comunidad','Community conversations')} right={<span className="ml-auto mr-1 flex items-center gap-2"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{t('Nuevo','New')}</span><span className="text-slate-600">0</span></span>}/>
   <Row href={`${prefix}/registro/profesional`} icon={Building2} label={t('Negocios agregados','Added businesses')} right={<span className="ml-auto mr-1 text-slate-600">{counts.added??0}</span>}/></section>

  <section data-me-community aria-labelledby="me-community"><h2 id="me-community" className={h2}>{t('Comunidad','Community')}</h2>
   <Row href={`${prefix}/mensajes`} icon={MessageSquareText} label={t('Mensajes','Messages')} right={<Badge n={mensajes}/>}/>
   <Row href={`${prefix}/eventos`} icon={Calendar} label={t('Eventos','Events')}/>
   <Row href={`${prefix}/notificaciones`} icon={Activity} label={t('Actividad','Activity')}/></section>

  <section data-me-more aria-labelledby="me-more"><h2 id="me-more" className={h2}>{t('Más en ContrataCR','More on ContrataCR')}</h2>
   <Row href={`${prefix}/profesionales`} icon={Users} label={t('Profesionales','Professionals')}/>
   {empleos&&<Row href={`${prefix}/empleos`} icon={Briefcase} label={t('Empleos','Jobs')}/>}
   {empleos&&<Row href={`${prefix}/empleos/mis-empleos`} icon={Briefcase} label={t('Mis empleos','My jobs')}/>}
   <Row href={`${prefix}/promociones`} icon={Tag} label={t('Promociones','Promotions')}/>
   <Row href={`${prefix}/promociones/mis-promociones`} icon={Tag} label={t('Mis promociones','My promotions')}/>
   <Row href={`${prefix}/solicitudes`} icon={FileText} label={t('Mis solicitudes','My requests')}/>
   <Row href={listsHref} icon={Bookmark} label={t('Mis listas','My lists')}/></section>

  <section data-me-account aria-labelledby="me-account"><h2 id="me-account" className={h2}>{t('Mi cuenta','My account')}</h2>
   {isPro&&<Row href={`${prefix}${dashboardHref}`} icon={Store} label={t('Mi negocio','My business')}/>}
   <Row href={`${prefix}${dashboardHref}`} icon={LayoutDashboard} label={t('Panel','Dashboard')}/>
   <Row href={`${prefix}${dashboardHref}`} icon={ShieldCheck} label={t('Seguridad','Security')}/>
   <Row href={`${prefix}/privacidad`} icon={Lock} label={t('Privacidad','Privacy')}/>
   <Row href={`${prefix}/ayuda`} icon={HelpCircle} label={t('Ayuda','Help')}/>
   <Row icon={LogOut} danger label={t('Cerrar sesión','Sign out')} onClick={()=>void signOutToHome(locale)}/></section>

  <MeShareSheet open={shareOpen} onClose={()=>setShareOpen(false)} url={shareUrl} locale={locale}/>
  <MeQrSheet open={qrOpen} onClose={()=>setQrOpen(false)} url={shareUrl} name={name} avatarUrl={shownAvatar} locale={locale} onShareFallback={()=>{setQrOpen(false);setShareOpen(true);}}/>
 </div>;
}
