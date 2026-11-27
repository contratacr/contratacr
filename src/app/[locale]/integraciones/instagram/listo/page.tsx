import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {INSTAGRAM_IMPORT_ENABLED} from '@/lib/integrations/instagram/enabled';
import {InstagramConnectDone} from '@/components/integrations/instagram-import';

// Where the connect window lands after Instagram (or the sandbox) answers: it tells the page that opened it and closes itself.
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Instagram',robots:{index:false,follow:false}};
export default async function InstagramConnectDonePage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{instagram?:string}>}){
 if(!INSTAGRAM_IMPORT_ENABLED)notFound();
 const {locale}=await params,{instagram}=await searchParams;
 return <main id="contenido" className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-3 px-4 py-10 text-[#162543]">
  <InstagramConnectDone locale={locale} result={instagram==='conectado'?'conectado':instagram==='cancelado'?'cancelado':'error'}/>
 </main>;
}
