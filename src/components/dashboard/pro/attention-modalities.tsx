'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { WorkplacesPicker, type Workplace } from '@/components/maps/workplaces-picker';
import { FilaInterruptor } from '@/components/ui/fila-interruptor';
import { SelectMenu } from '@/components/ui/select-menu';
import { PROVINCES, getCantonsByProvince, getCantonById, getProvinceById } from '@/lib/data/cr-geography';
import { isFixedWorkplace } from '@/lib/public-workplaces';

type Props = { value: Workplace[]; onChange: (value: Workplace[]) => void; english: boolean; video: boolean; onVideoChange: (value: boolean) => void; canVideo: boolean };
const coverage = (place: Workplace) => place.homeService !== false && (place.level === 'country' || place.level === 'provincia' || !!place.cantonId);

export function AttentionModalities({ value, onChange, english, video, onVideoChange, canVideo }: Props) {
  const [local, setLocal] = useState(value.some(place => isFixedWorkplace(place) && place.receivesClients !== false));
  const [home, setHome] = useState(value.some(coverage));
  const [province, setProvince] = useState('');
  const [canton, setCanton] = useState('');
  const [areaKind, setAreaKind] = useState('canton');
  const [addingArea, setAddingArea] = useState(false);
  const [error, setError] = useState('');
  const selected = value.filter(coverage);

  function addArea() {
    if (!province && areaKind !== 'country') return;
    if (areaKind === 'canton' && !canton) return;
    const level = areaKind === 'country' ? 'country' : areaKind === 'province' ? 'provincia' : 'canton';
    const existing = value.find(place => (place.level ?? (place.cantonId ? 'canton' : 'provincia')) === level && (level === 'country' || (place.provinciaId === province && (level === 'provincia' || place.cantonId === canton))) && !isFixedWorkplace(place));
    if (existing && existing.homeService !== false) { setError(english ? 'This area is already added.' : 'Esta zona ya está agregada.'); return; }
    if (existing) onChange(value.map(place => place.id === existing.id ? { ...place, homeService: true, homeServicePaused: false } : place));
    else onChange([...value, {
      id: `wp_coverage_${level}_${province}_${canton || 'all'}`,
      name: level === 'country' ? (english ? 'All Costa Rica' : 'Todo Costa Rica') : level === 'provincia' ? getProvinceById(province)?.name ?? '' : [getCantonById(canton)?.name, getProvinceById(province)?.name].filter(Boolean).join(', '),
      address: '', level, provinciaId: level === 'country' ? undefined : province, cantonId: level === 'canton' ? canton : undefined,
      homeService: true, homeServicePaused: false, receivesClients: false,
    }]);
    setError(''); setCanton(''); setProvince(''); setAddingArea(false);
  }

  return <div className="divide-y divide-[#e5e7eb]">
    <div className="space-y-3 pb-5">
      <FilaInterruptor titulo={english ? 'Clients visit me at a location' : 'Recibo clientes en un lugar'} ayuda={english ? 'Add the location where clients can visit you.' : 'Agregá el lugar donde pueden visitarte.'} checked={local} onChange={enabled => { setLocal(enabled); onChange(value.map(place => isFixedWorkplace(place) ? { ...place, receivesClients: enabled } : place)); }}/>
      {local && <WorkplacesPicker mode="local" value={value} onChange={onChange} mapHeight={168}/>}
    </div>
    <div className="space-y-3 py-5">
      <FilaInterruptor titulo={english ? 'I travel to clients' : 'Voy donde el cliente'} ayuda={english ? 'Choose the areas you cover.' : 'Elegí las zonas donde atendés.'} checked={home} onChange={enabled => { setHome(enabled); onChange(value.map(place => enabled ? (place.homeServicePaused ? { ...place, homeService: true, homeServicePaused: false } : place) : (coverage(place) ? { ...place, homeService: false, homeServicePaused: true } : place))); }}/>
      {home && <div className="space-y-3 pl-1">
        {selected.length > 0 && <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">{selected.map((place, index) => <div key={place.id} className={`flex items-center justify-between gap-3 px-4 py-2 ${index ? 'border-t border-[#e5e7eb]' : ''}`}><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#162543]">{place.name}</p><p className="text-xs text-[#64748b]">{place.level === 'country' ? (english ? 'Entire country' : 'Todo el país') : place.level === 'provincia' ? (english ? 'Entire province' : 'Toda la provincia') : (english ? 'Canton' : 'Cantón')}</p></div><button type="button" className="grid h-11 w-11 shrink-0 place-items-center text-[#a12828]" aria-label={english ? `Remove ${place.name}` : `Quitar ${place.name}`} onClick={() => onChange(value.map(item => item.id === place.id ? { ...item, homeService: false, homeServicePaused: false } : item))}><X className="h-4 w-4"/></button></div>)}</div>}
        {!addingArea && selected.length > 0 && <button type="button" onClick={() => setAddingArea(true)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#0089bb]"><Plus className="h-4 w-4"/>{english ? 'Add another area' : 'Agregar otra zona'}</button>}
        {(addingArea || selected.length === 0) && <div className="space-y-3 rounded-xl border border-[#dbe7ef] bg-[#f8fcff] p-4">
        <div className="flex items-center justify-between"><p className="text-sm font-bold text-[#162543]">{english ? 'New service area' : 'Nueva zona de atención'}</p>{selected.length > 0 && <button type="button" onClick={() => { setAddingArea(false); setError(''); }} className="min-h-11 px-2 text-sm font-semibold text-[#64748b]">{english ? 'Cancel' : 'Cancelar'}</button>}</div>
        <SelectMenu label={english ? 'Area to add' : 'Agregar zona'} value={areaKind} onChange={next => { setAreaKind(next); setProvince(''); setCanton(''); setError(''); }} options={[{ value: 'canton', label: english ? 'One canton' : 'Un cantón' }, { value: 'province', label: english ? 'Whole province' : 'Toda una provincia' }, { value: 'country', label: english ? 'All Costa Rica' : 'Todo Costa Rica' }]}/>
        {areaKind !== 'country' && <SelectMenu label={english ? 'Province' : 'Provincia'} value={province} onChange={next => { setProvince(next); setCanton(''); }} placeholder={english ? 'Choose a province' : 'Elegí una provincia'} options={PROVINCES.map(item => ({ value: item.id, label: item.name }))}/>}
        {areaKind === 'canton' && <SelectMenu label={english ? 'Canton' : 'Cantón'} value={canton} onChange={setCanton} disabled={!province} placeholder={english ? 'Choose a canton' : 'Elegí un cantón'} options={getCantonsByProvince(province).map(item => ({ value: item.id, label: item.name }))}/>}
        <button type="button" disabled={areaKind !== 'country' && (!province || (areaKind === 'canton' && !canton))} onClick={addArea} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#e8f7fd] px-4 text-sm font-bold text-[#0089bb] disabled:opacity-50"><Plus className="h-4 w-4"/>{english ? 'Add area' : 'Agregar zona'}</button>
        {error && <p role="status" className="text-xs text-[#a12828]">{error}</p>}
        </div>}
      </div>}
    </div>
    {canVideo && <div className="py-5"><FilaInterruptor titulo={english ? 'I offer video calls' : 'Atiendo por videollamada'} ayuda={english ? 'Available nationwide.' : 'Disponible en todo el país.'} checked={video} onChange={onVideoChange}/></div>}
  </div>;
}
