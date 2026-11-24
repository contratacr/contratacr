'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import QRCode from 'qrcode';
import {ScanLine,Share2} from 'lucide-react';
import {MeSheet,tryNativeShare} from '@/components/account/me-share-sheet';

/** «Código QR»: card with the profile QR (generated in the browser, high error correction so the avatar in the centre is safe),
 *  the name and the buttons Compartir | Escanear. Escanear only exists where BarcodeDetector and a camera exist. */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
type Detector={detect:(v:HTMLVideoElement)=>Promise<{rawValue:string}[]>};
export function MeQrSheet({open,onClose,url,name,avatarUrl,locale,onShareFallback}:{open:boolean;onClose:()=>void;url:string;name:string;avatarUrl:string|null;locale:string;onShareFallback:()=>void}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [src,setSrc]=useState<string|null>(null),[scanning,setScanning]=useState(false),[found,setFound]=useState<string|null>(null),[camError,setCamError]=useState(false);
 const canScan=useSyncExternalStore(()=>()=>{},()=>'BarcodeDetector' in window&&!!navigator.mediaDevices?.getUserMedia,()=>false);
 const video=useRef<HTMLVideoElement>(null);
 useEffect(()=>{if(!open)return;let live=true;
  QRCode.toDataURL(url,{errorCorrectionLevel:'H',margin:1,width:480,color:{dark:'#162543',light:'#ffffff'}}).then(d=>{if(live)setSrc(d);}).catch(()=>{if(live)setSrc(null);});
  return()=>{live=false;};},[open,url]);
 useEffect(()=>{
  if(!scanning)return;let stream:MediaStream|null=null,stop=false,timer=0;
  (async()=>{
   try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    if(stop){stream.getTracks().forEach(x=>x.stop());return;}
    const v=video.current;if(!v)return;v.srcObject=stream;await v.play();
    const Ctor=(window as unknown as {BarcodeDetector:new(o:{formats:string[]})=>Detector}).BarcodeDetector,d=new Ctor({formats:['qr_code']});
    const tick=async()=>{if(stop)return;try{const r=await d.detect(v);if(r[0]?.rawValue){setFound(r[0].rawValue);setScanning(false);return;}}catch{/* frame not ready */}timer=window.setTimeout(tick,400);};
    void tick();
   }catch{setCamError(true);setScanning(false);}
  })();
  return()=>{stop=true;window.clearTimeout(timer);stream?.getTracks().forEach(x=>x.stop());};
 },[scanning]);
 const safeLink=(()=>{if(!found)return null;try{const u=new URL(found);return u.protocol==='https:'||u.protocol==='http:'?u.href:null;}catch{return null;}})();
 const close=()=>{setScanning(false);setFound(null);setCamError(false);onClose();};
 const share=async()=>{if(!(await tryNativeShare(url,name,t('Mi código QR en ContrataCR','My QR code on ContrataCR'))))onShareFallback();};
 return <MeSheet open={open} onClose={close} title={t('Código QR','QR code')} closeLabel={t('Cerrar','Close')}>
  <div data-me-qr-sheet className="space-y-4">
   <div className="mx-auto w-full max-w-[18rem] rounded-3xl border border-[#d7e1ea] bg-white p-4 text-center">
    {scanning?<video ref={video} muted playsInline aria-label={t('Cámara para escanear','Camera to scan')} className="aspect-square w-full rounded-2xl bg-black object-cover"/>
     :<div className="relative mx-auto aspect-square w-full">
      {src?/* eslint-disable-next-line @next/next/no-img-element -- data URL generated here */<img data-me-qr-image src={src} alt={t('Código QR de su perfil','QR code of your profile')} className="h-full w-full"/>:<div className="grid h-full w-full place-items-center rounded-2xl bg-slate-100 text-sm text-slate-600">{t('Generando…','Generating…')}</div>}
      <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full border-4 border-white bg-[#eaf6fb] text-xl font-extrabold text-[#0089bb]">
       {avatarUrl?/* eslint-disable-next-line @next/next/no-img-element -- avatar small fixed */<img src={avatarUrl} alt="" className="h-full w-full object-cover"/>:name.trim().charAt(0).toUpperCase()}</span></div>}
    <p className="mt-3 truncate text-lg font-extrabold">{name}</p></div>
   {found&&<p role="status" className="break-all rounded-xl bg-[#eaf6fb] p-3 text-sm">{safeLink?<a className="font-semibold text-[#0089bb] underline" href={safeLink} target="_blank" rel="noopener noreferrer">{safeLink}</a>:found}</p>}
   {camError&&<p role="alert" className="text-sm font-semibold text-red-800">{t('No se pudo abrir la cámara.','The camera could not be opened.')}</p>}
   <div className="flex gap-2">
    <button type="button" data-me-qr-share onClick={share} className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#162543] px-4 font-bold text-white ${ring}`}><Share2 aria-hidden="true" className="h-4 w-4"/>{t('Compartir','Share')}</button>
    {canScan&&<button type="button" data-me-qr-scan aria-pressed={scanning} onClick={()=>{setFound(null);setCamError(false);setScanning(v=>!v);}} className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] px-4 font-bold ${ring}`}><ScanLine aria-hidden="true" className="h-4 w-4"/>{t('Escanear','Scan')}</button>}
   </div></div></MeSheet>;
}
