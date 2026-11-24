import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {AssistantScreen} from '@/components/directory/assistant-screen';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// Directory app mode (DIR_ENABLED, test only): the "Asistente" tab. The public assistant is free and has no login wall.
export const dynamic='force-dynamic';

export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;
 const names:Record<string,string>={es:'Asistente',en:'Assistant'};
 return {title:`${names[locale]??names.es} | ContrataCR`,robots:{index:false,follow:false}};
}

export default function AssistantRoute(){
 if(!DIR_ENABLED)notFound();
 return <AssistantScreen/>;
}
