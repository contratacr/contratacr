import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { WorkplacesPicker, type Workplace } from '../../src/components/maps/workplaces-picker';
import { WorkplaceDirections } from '../../src/components/professionals/workplace-directions';
import { AttentionModalities } from '../../src/components/dashboard/pro/attention-modalities';
import es from '../../messages/es.json';
import en from '../../messages/en.json';
const multi = new URLSearchParams(location.search).has('multi');
const english = new URLSearchParams(location.search).has('en');
const editor = new URLSearchParams(location.search).has('editor');
const seed: Workplace[] = [
 ...(multi ? [{id:'second',name:'Segunda sede',address:'Otra dirección',level:'canton' as const,provinciaId:'2',cantonId:'205',lat:9.98,lng:-84.39}] : []),
 {id:'fixed',name:'Sede de ejemplo',address:'Dirección de ejemplo',level:'canton',provinciaId:'2',cantonId:'205',lat:9.97,lng:-84.38},
 {id:'coverage',name:'Cobertura Atenas',address:'',level:'canton',provinciaId:'2',cantonId:'205',homeService:true},
];
function App(){
 const [saved,setSaved]=useState<Workplace[]>(JSON.parse(sessionStorage.getItem('locations')||'null')||seed);
 const [draft,setDraft]=useState(saved);
 const [video,setVideo]=useState(false);
 if(editor) return <NextIntlClientProvider locale={english?'en':'es'} messages={english?en:es}><main className="mx-auto max-w-xl space-y-6 p-4"><h1>Dónde ofrecés tus servicios</h1><AttentionModalities value={draft} onChange={setDraft} english={english} video={video} onVideoChange={setVideo} canVideo/><button className="min-h-11" onClick={()=>{sessionStorage.setItem('locations',JSON.stringify(draft));setSaved(draft);}}>Guardar cambios</button><output className="block break-all" data-saved-locations>{JSON.stringify(saved)}</output></main></NextIntlClientProvider>;
 return <NextIntlClientProvider locale={english?'en':'es'} messages={english?en:es}><main className="mx-auto max-w-xl space-y-6 p-4"><h1>Perfil de ejemplo</h1><WorkplacesPicker value={draft} onChange={setDraft}/><button className="min-h-11" onClick={()=>{sessionStorage.setItem('locations',JSON.stringify(draft));setSaved(draft);}}>Guardar lugares</button><WorkplaceDirections places={saved} english={english}/></main></NextIntlClientProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
