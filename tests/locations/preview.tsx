import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { WorkplacesPicker, type Workplace } from '../../src/components/maps/workplaces-picker';
import { WorkplaceDirections } from '../../src/components/professionals/workplace-directions';
import { AttentionModalities } from '../../src/components/dashboard/pro/attention-modalities';
import { serviceModalities } from '../../src/components/professionals/service-modalities';
import es from '../../messages/es.json';
import en from '../../messages/en.json';
const multi = new URLSearchParams(location.search).has('multi');
const english = new URLSearchParams(location.search).has('en');
const editor = new URLSearchParams(location.search).has('editor');
const info = new URLSearchParams(location.search).has('info');
const seed: Workplace[] = [
 ...(multi ? [{id:'second',name:'Segunda sede',address:'Otra dirección',level:'canton' as const,provinciaId:'al',cantonId:'al-at',lat:9.98,lng:-84.39}] : []),
 {id:'fixed',name:'Sede de ejemplo',address:'Dirección de ejemplo',level:'canton',provinciaId:'al',cantonId:'al-at',lat:9.97,lng:-84.38},
 {id:'coverage',name:'Cobertura Atenas',address:'',level:'canton',provinciaId:'al',cantonId:'al-at',homeService:true},
];
// Synthetic profile: two sites (one is legacy, without homeService), the same canton saved twice and a whole province.
const infoSeed: Workplace[] = [
 {id:'site',name:'Sede de ejemplo',address:'Calle de ejemplo 123, frente al parque, Atenas, Alajuela',level:'canton',provinciaId:'al',cantonId:'al-at',lat:9.97,lng:-84.38,receivesClients:true,homeService:false},
 {id:'legacy',name:'Segunda sede',address:'Otra dirección de ejemplo',showAddress:false,level:'canton',provinciaId:'al',cantonId:'al-at',lat:9.98,lng:-84.39},
 {id:'area',name:'Cobertura Atenas',address:'',level:'canton',provinciaId:'al',cantonId:'al-at',homeService:true,receivesClients:false},
 {id:'prov',name:'Heredia',address:'',level:'provincia',provinciaId:'he',homeService:true,receivesClients:false},
];
function App(){
 const [saved,setSaved]=useState<Workplace[]>(JSON.parse(sessionStorage.getItem('locations')||'null')||seed);
 const [draft,setDraft]=useState(saved);
 const [video,setVideo]=useState(false);
 if(info) return <main className="mx-auto max-w-xl space-y-6 p-4"><h1>Información de ejemplo</h1><section data-info-preview className="text-[15px] font-semibold text-[#162543]">{serviceModalities({workplaces:infoSeed,video:true,videoCountry:true,english})}</section><div data-social-row className="flex flex-wrap items-center justify-center gap-2"><a className="grid h-9 w-9 place-items-center rounded-full border border-[#e5e7eb]" aria-label="red">in</a><WorkplaceDirections places={infoSeed} english={english}/></div></main>;
 if(editor) return <NextIntlClientProvider locale={english?'en':'es'} messages={english?en:es}><main className="mx-auto max-w-xl space-y-6 p-4"><h1>Ubicación del servicio</h1><AttentionModalities value={draft} onChange={setDraft} english={english} video={video} onVideoChange={setVideo} canVideo/><button className="min-h-11" onClick={()=>{sessionStorage.setItem('locations',JSON.stringify(draft));setSaved(draft);}}>Guardar cambios</button><output className="block break-all" data-saved-locations>{JSON.stringify(saved)}</output></main></NextIntlClientProvider>;
 return <NextIntlClientProvider locale={english?'en':'es'} messages={english?en:es}><main className="mx-auto max-w-xl space-y-6 p-4"><h1>Perfil de ejemplo</h1><WorkplacesPicker value={draft} onChange={setDraft}/><button className="min-h-11" onClick={()=>{sessionStorage.setItem('locations',JSON.stringify(draft));setSaved(draft);}}>Guardar lugares</button><WorkplaceDirections places={saved} english={english}/></main></NextIntlClientProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
