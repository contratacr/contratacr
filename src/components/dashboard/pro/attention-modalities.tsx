'use client';
import { useState } from 'react';
import { WorkplacesPicker, type Workplace } from '@/components/maps/workplaces-picker';
import { FilaInterruptor } from '@/components/ui/fila-interruptor';
import { isFixedWorkplace } from '@/lib/public-workplaces';
export function AttentionModalities({ value, onChange, english, video, onVideoChange, canVideo }: { value: Workplace[]; onChange: (value: Workplace[]) => void; english: boolean; video: boolean; onVideoChange: (v: boolean) => void; canVideo: boolean }) {
  const [local, setLocal] = useState(value.some(w => isFixedWorkplace(w) && w.receivesClients !== false));
  const [home, setHome] = useState(value.some(w => w.homeService !== false && (!!w.cantonId || w.level === 'country' || w.level === 'provincia')));
  return <div className="divide-y divide-[#e5e7eb]">
    <div className="space-y-3 pb-5"><FilaInterruptor titulo={english ? 'At my premises' : 'En mi local'} ayuda={english ? 'Clients come to your shop, workshop or office.' : 'Los clientes vienen a tu local, taller o consultorio.'} checked={local} onChange={enabled => { setLocal(enabled); onChange(value.map(w => isFixedWorkplace(w) ? {...w, receivesClients:enabled} : w)); }}/>{local && <WorkplacesPicker mode="local" value={value} onChange={onChange} mapHeight={168}/>}</div>
    <div className="space-y-3 py-5"><FilaInterruptor titulo={english ? 'At the client location' : 'A domicilio'} ayuda={english ? 'You travel to the client.' : 'Vas donde el cliente.'} checked={home} onChange={enabled => { setHome(enabled); onChange(value.map(w => ({...w, homeService:enabled}))); }}/>{home && <WorkplacesPicker mode="coverage" value={value} onChange={onChange}/>}</div>
    {!local && !home && !value.some(w => w.cantonId) && <div className="py-5"><p className="mb-3 text-sm font-semibold text-[#162543]">{english ? 'Your canton' : 'Tu cantón'}</p><WorkplacesPicker mode="reference" value={value} onChange={onChange}/></div>}
    {canVideo && <div className="py-5"><FilaInterruptor titulo={english ? 'By video call' : 'Por videollamada'} ayuda={english ? 'Available nationwide.' : 'Disponible en todo el país.'} checked={video} onChange={onVideoChange}/></div>}
  </div>;
}
