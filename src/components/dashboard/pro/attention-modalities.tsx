'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { WorkplacesPicker, type Workplace } from '@/components/maps/workplaces-picker';
import { FilaInterruptor } from '@/components/ui/fila-interruptor';
import { SelectMenu } from '@/components/ui/select-menu';
import { PROVINCES, getCantonsByProvince, getCantonById, getProvinceById } from '@/lib/data/cr-geography';
import { isFixedWorkplace, coversArea, coverageKey } from '@/lib/public-workplaces';

type Props = { value: Workplace[]; onChange: (value: Workplace[]) => void; english: boolean; video: boolean; onVideoChange: (value: boolean) => void; canVideo: boolean };
const coverage = (place: Workplace) => coversArea(place);

export function AttentionModalities({ value, onChange, english, video, onVideoChange, canVideo }: Props) {
  const [local, setLocal] = useState(value.some(place => isFixedWorkplace(place) && place.receivesClients !== false));
  const [home, setHome] = useState(value.some(coverage));
  const [province, setProvince] = useState('');
  const [canton, setCanton] = useState('');
  const [areaKind, setAreaKind] = useState('canton');
  const [addingArea, setAddingArea] = useState(false);
  const [error, setError] = useState('');
  // Ids de la zona que se está editando: al guardar, esa zona se reemplaza por la nueva.
  const [editingZone, setEditingZone] = useState<string[] | null>(null);
  const selected = value.filter(coverage);
  // UNA FILA POR ZONA, CON SU NOMBRE GEOGRÁFICO. Una sede vieja que también
  // cubría su cantón aparecía aquí con el nombre de la sede («Segunda sede ·
  // Cantón») y, si había dos sedes en el mismo cantón, repetida. La zona se
  // nombra por cantón/provincia y quitarla quita todas sus copias.
  const zones = Array.from(selected.reduce((groups, place) => {
    const key = coverageKey(place);
    const group = groups.get(key);
    if (group) group.ids.push(place.id);
    else groups.set(key, { key, ids: [place.id], level: place.level === 'country' ? 'country' : place.level === 'provincia' ? 'provincia' : 'canton', name: place.level === 'country' ? (english ? 'All Costa Rica' : 'Todo Costa Rica') : place.level === 'provincia' ? (getProvinceById(place.provinciaId ?? '')?.name ?? place.name) : ([getCantonById(place.cantonId ?? '')?.name, getProvinceById(place.provinciaId ?? '')?.name].filter(Boolean).join(', ') || place.name) });
    return groups;
  }, new Map<string, { key: string; ids: string[]; level: 'country' | 'provincia' | 'canton'; name: string }>()).values());

  function addArea() {
    const base = editingZone ? value.map(place => editingZone.includes(place.id) ? { ...place, homeService: false, homeServicePaused: false } : place) : value;
    const baseSelected = base.filter(coverage);
    if (!province && areaKind !== 'country') return;
    if (areaKind === 'canton' && !canton) return;
    const level = areaKind === 'country' ? 'country' : areaKind === 'province' ? 'provincia' : 'canton';
    const existing = base.find(place => (place.level ?? (place.cantonId ? 'canton' : 'provincia')) === level && (level === 'country' || (place.provinciaId === province && (level === 'provincia' || place.cantonId === canton))) && !isFixedWorkplace(place));
    const newKey = coverageKey({ level, provinciaId: province, cantonId: level === 'canton' ? canton : undefined });
    if ((existing && existing.homeService !== false) || baseSelected.some(place => coverageKey(place) === newKey)) { setError(english ? 'This area is already added.' : 'Esta zona ya está agregada.'); return; }
    if (existing) onChange(base.map(place => place.id === existing.id ? { ...place, homeService: true, homeServicePaused: false } : place));
    else onChange([...base, {
      id: `wp_coverage_${level}_${province}_${canton || 'all'}`,
      name: level === 'country' ? (english ? 'All Costa Rica' : 'Todo Costa Rica') : level === 'provincia' ? getProvinceById(province)?.name ?? '' : [getCantonById(canton)?.name, getProvinceById(province)?.name].filter(Boolean).join(', '),
      address: '', level, provinciaId: level === 'country' ? undefined : province, cantonId: level === 'canton' ? canton : undefined,
      homeService: true, homeServicePaused: false, receivesClients: false,
    }]);
    setError(''); setCanton(''); setProvince(''); setAddingArea(false); setEditingZone(null);
  }

  return <div className="divide-y divide-[#e5e7eb]">
    <div className="space-y-3 pb-5">
      <FilaInterruptor titulo={english ? 'I work at my place' : 'Atiendo en mi local'} columna ayuda={english ? 'Add the location where clients can visit you.' : 'Agregue el lugar donde pueden visitarlo.'} checked={local} onChange={enabled => { setLocal(enabled); onChange(value.map(place => isFixedWorkplace(place) ? { ...place, receivesClients: enabled } : place)); }}/>
      {local && <WorkplacesPicker mode="local" value={value} onChange={onChange} mapHeight={168}/>}
    </div>
    <div className="space-y-3 py-5">
      <FilaInterruptor titulo={english ? 'I work at the client\'s home' : 'Atiendo a domicilio'} ayuda={english ? 'Choose the areas you travel to.' : 'Elija las zonas a las que va.'} columna checked={home} onChange={enabled => { setHome(enabled); onChange(value.map(place => enabled ? (place.homeServicePaused ? { ...place, homeService: true, homeServicePaused: false } : place) : (coverage(place) ? { ...place, homeService: false, homeServicePaused: true } : place))); }}/>
      {home && <div className="space-y-3">
        {zones.length > 0 && <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">{zones.map((zone, index) => <div key={zone.key} className={`flex items-center justify-between gap-3 py-1 pl-4 pr-1 ${index ? 'border-t border-[#e5e7eb]' : ''}`}><div className="min-w-0 py-1.5"><p className="break-words text-sm font-semibold leading-5 text-[#162543]">{zone.name}</p><p className="text-xs text-[#64748b]">{zone.level === 'country' ? (english ? 'Entire country' : 'Todo el país') : zone.level === 'provincia' ? (english ? 'Entire province' : 'Toda la provincia') : (english ? 'Canton' : 'Cantón')}</p></div><div className="flex shrink-0 items-center"><button type="button" className="grid h-11 w-11 place-items-center rounded-full text-[#0089bb] hover:bg-[#f1f8fb]" aria-label={english ? `Edit ${zone.name}` : `Editar ${zone.name}`} onClick={() => { const first = selected.find(item => zone.ids.includes(item.id)); setAreaKind(zone.level === 'country' ? 'country' : zone.level === 'provincia' ? 'province' : 'canton'); setProvince(first?.provinciaId ?? ''); setCanton(first?.cantonId ?? ''); setError(''); setEditingZone(zone.ids); setAddingArea(true); }}><Pencil className="h-4 w-4"/></button><button type="button" className="grid h-11 w-11 place-items-center rounded-full text-[#a12828] hover:bg-red-50" aria-label={english ? `Remove ${zone.name}` : `Quitar ${zone.name}`} onClick={() => onChange(value.map(item => zone.ids.includes(item.id) ? { ...item, homeService: false, homeServicePaused: false } : item))}><Trash2 className="h-4 w-4"/></button></div></div>)}</div>}
        {!addingArea && selected.length > 0 && <button type="button" onClick={() => setAddingArea(true)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#0089bb]"><Plus className="h-4 w-4"/>{english ? 'Add another area' : 'Agregar otra zona'}</button>}
        {(addingArea || selected.length === 0) && <div className="space-y-3 rounded-xl border border-[#dbe7ef] bg-[#f8fcff] p-4">
        <div className="flex items-center justify-between"><p className="text-sm font-bold text-[#162543]">{editingZone ? (english ? 'Edit service area' : 'Editar zona de atención') : (english ? 'New service area' : 'Nueva zona de atención')}</p>{selected.length > 0 && <button type="button" onClick={() => { setAddingArea(false); setError(''); setEditingZone(null); setProvince(''); setCanton(''); }} className="min-h-11 px-2 text-sm font-semibold text-[#64748b]">{english ? 'Cancel' : 'Cancelar'}</button>}</div>
        <SelectMenu label={english ? 'Area to add' : 'Agregar zona'} value={areaKind} onChange={next => { setAreaKind(next); setProvince(''); setCanton(''); setError(''); }} options={[{ value: 'canton', label: english ? 'One canton' : 'Un cantón' }, { value: 'province', label: english ? 'Whole province' : 'Toda una provincia' }, { value: 'country', label: english ? 'All Costa Rica' : 'Todo Costa Rica' }]}/>
        {areaKind !== 'country' && <SelectMenu label={english ? 'Province' : 'Provincia'} value={province} onChange={next => { setProvince(next); setCanton(''); }} placeholder={english ? 'Choose a province' : 'Elija una provincia'} options={PROVINCES.map(item => ({ value: item.id, label: item.name }))}/>}
        {areaKind === 'canton' && <SelectMenu label={english ? 'Canton' : 'Cantón'} value={canton} onChange={setCanton} disabled={!province} placeholder={english ? 'Choose a canton' : 'Elija un cantón'} options={getCantonsByProvince(province).map(item => ({ value: item.id, label: item.name }))}/>}
        <button type="button" disabled={areaKind !== 'country' && (!province || (areaKind === 'canton' && !canton))} onClick={addArea} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#e8f7fd] px-4 text-sm font-bold text-[#0089bb] disabled:opacity-50">{editingZone ? <Pencil className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}{editingZone ? (english ? 'Save area' : 'Guardar zona') : (english ? 'Add area' : 'Agregar zona')}</button>
        {error && <p role="status" className="text-xs text-[#a12828]">{error}</p>}
        </div>}
      </div>}
    </div>
    {canVideo && <div className="py-5"><FilaInterruptor titulo={english ? 'I work by video call' : 'Atiendo por videollamada'} columna ayuda={english ? 'Available nationwide.' : 'Disponible en todo el país.'} checked={video} onChange={onVideoChange}/></div>}
  </div>;
}
