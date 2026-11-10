import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { WorkplacesPicker, type Workplace } from '../../src/components/maps/workplaces-picker';
import { WorkplaceDirections } from '../../src/components/professionals/workplace-directions';
import es from '../../messages/es.json';
import en from '../../messages/en.json';
const english = new URLSearchParams(location.search).has('en');
const seed: Workplace[] = [
 {id:'fixed',name:'Sede de ejemplo',address:'Dirección de ejemplo',level:'canton',provinciaId:'2',cantonId:'205',lat:9.97,lng:-84.38},
 {id:'coverage',name:'Cobertura Atenas',address:'',level:'canton',provinciaId:'2',cantonId:'205',homeService:true},
];
function App(){
 const [saved,setSaved]=useState<Workplace[]>(JSON.parse(sessionStorage.getItem('locations')||'null')||seed);
 const [draft,setDraft]=useState(saved);
 return <NextIntlClientProvider locale={english?'en':'es'} messages={english?en:es}><main className="mx-auto max-w-xl space-y-6 p-4"><h1>Perfil de ejemplo</h1><WorkplacesPicker value={draft} onChange={setDraft}/><button className="min-h-11" onClick={()=>{sessionStorage.setItem('locations',JSON.stringify(draft));setSaved(draft);}}>Guardar lugares</button><WorkplaceDirections places={saved} english={english}/></main></NextIntlClientProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
