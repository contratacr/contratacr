import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { ProfileEditor } from '../../src/components/dashboard/pro/profile-editor';
import { CvProfileDetails } from '../../src/components/professionals/cv-profile';
import { SectionBrand } from '../../src/components/layout/section-brand';
import es from '../../messages/es.json';
import en from '../../messages/en.json';
const english = new URLSearchParams(location.search).get('lang') === 'en';
// ?legacy: certifications saved by the previous form (one of them is also in the sample CV).
const legacy = new URLSearchParams(location.search).has('legacy') ? [{id:'cert-1',name:'Técnico en Administración',institution:'Instituto de Ejemplo',year:'2020'},{id:'cert-2',name:'Curso de Excel',institution:'INA',year:'2019'}] : [];
const initial = {
 id: '00000000-0000-4000-8000-000000000001', profile_id: '00000000-0000-4000-8000-000000000002',
 profiles: {full_name:'María Ejemplo'}, bio:'Servicio profesional de ejemplo', whatsapp:'50688887777', professions:[],
 workplaces:[{id:'ejemplo',name:'Atenas',provincia_id:'2',canton_id:'205',level:'canton'}], certifications:legacy,
 cv_profile: JSON.parse(sessionStorage.getItem('cv-saved') || '{"education":[],"experience":[],"skills":[]}'),
};
function App() {
 const [saved, setSaved] = useState(initial.cv_profile);
 return <NextIntlClientProvider locale={english ? 'en' : 'es'} messages={english ? en : es} timeZone="America/Costa_Rica">
  <main className="mx-auto max-w-2xl bg-white text-[#162543]">
   <header className="border-b border-[#e5e7eb] px-4 py-5"><SectionBrand title={english ? "Education" : "Formación"}/></header>
   <ProfileEditor professionalId={initial.id} profileId={initial.profile_id} initial={initial} focusField="education" focusKey={1} onSaved={() => setSaved(JSON.parse(sessionStorage.getItem('cv-saved') || '{}'))}/>
   <section className="m-4 border-t border-[#dce5ee] pt-6"><h2 className="mb-4 text-lg font-semibold">{english ? 'Education' : 'Formación'}</h2><CvProfileDetails value={saved} english={english} professionalId={initial.id} hasFile={new URLSearchParams(location.search).has("shared")} legacyEducation={legacy.map(c=>({title:c.name,organization:c.institution,period:c.year,description:''}))}/></section>
  </main>
 </NextIntlClientProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
