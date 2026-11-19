'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
/** Optional local Pro continuation; contacting the publisher stays the primary action. */
export function ProjectQuoteAction({projectId}:{projectId:string}){
 const {user,hasProfessionalProfile}=useAuth(),locale=useLocale(),router=useRouter(),t=useTranslations('ProProjectJourney');
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(process.env.NODE_ENV!=='development'||!user||!hasProfessionalProfile)return;let alive=true;void fetch('/api/pro/access',{cache:'no-store'}).then(async response=>{if(alive)setEnabled(response.ok&&(await response.json()).enabled===true);}).catch(()=>{});return()=>{alive=false;};},[user,hasProfessionalProfile]);
 async function prepare(){if(busy)return;setBusy(true);setError('');try{const response=await fetch('/api/pro/project-quote-context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId})}),body=await response.json();if(!response.ok||body.projectId!==projectId||typeof body.clientId!=='string')throw Error();router.push(prefijoDeIdioma(locale)+'/dashboard/profesional?'+new URLSearchParams({tab:'quotes',nueva:'1',cliente:body.clientId,proyectoOrigen:projectId,volverProyecto:window.location.pathname+window.location.search}));}catch{setError(t('prepareError'));setBusy(false);}}
 if(!enabled)return null;
 return <div className="mt-5 space-y-2" data-project-quote-action><p className="text-sm text-[#52627a]">{t('prepareHint')}</p><Button variant="secondary" disabled={busy} onClick={()=>void prepare()}>{busy?t('preparing'):t('prepare')}</Button>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
