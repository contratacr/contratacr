import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {instagramAdapterOrNull} from '@/lib/integrations/instagram/server';
import {SANDBOX_CODE,SANDBOX_USERNAME} from '@/lib/integrations/instagram/sandbox';

// Local sandbox of "Importar desde Instagram" (docs/instagram-import.md): stands in for Instagram's authorize screen while no
// Meta app exists. Only reachable when the sandbox adapter is active (next dev); a production build answers 404.
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Instagram (prueba local)',robots:{index:false,follow:false}};
export default async function InstagramSandboxConnect({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{state?:string}>}){
 if(instagramAdapterOrNull()?.provider!=='sandbox')notFound();
 const {locale}=await params,{state=''}=await searchParams,en=locale==='en';
 const t=(es:string,english:string)=>en?english:es;
 const q=(extra:Record<string,string>)=>'/api/integrations/instagram/callback?'+new URLSearchParams({state,...extra}).toString();
 return <main id="contenido" data-instagram-sandbox className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-5 px-4 py-10 text-[#162543]">
  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{t('Prueba local: esta pantalla reemplaza a Instagram mientras no exista la aplicación de Meta. No se conecta ninguna cuenta real.','Local test: this screen stands in for Instagram until the Meta app exists. No real account is connected.')}</p>
  <h1 className="text-2xl font-bold">{t('Conectar su cuenta de Instagram (Empresa o Creador)','Connect your Instagram account (Business or Creator)')}</h1>
  <p className="text-slate-700">{t(`ContrataCR podrá ver el nombre de usuario y las fotos publicadas de la cuenta de muestra "${SANDBOX_USERNAME}". No podrá publicar ni enviar mensajes.`,`ContrataCR will be able to see the username and published photos of the sample account "${SANDBOX_USERNAME}". It will not be able to post or send messages.`)}</p>
  <div className="flex flex-col gap-2 sm:flex-row">
   <a href={q({code:SANDBOX_CODE})} data-instagram-sandbox-allow className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#162543] px-6 text-sm font-semibold text-white">{t('Permitir','Allow')}</a>
   <a href={q({error:'access_denied'})} data-instagram-sandbox-deny className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#162543] px-6 text-sm font-semibold">{t('Cancelar','Cancel')}</a>
  </div>
 </main>;
}
