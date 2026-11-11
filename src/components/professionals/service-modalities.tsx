import type { ReactNode } from 'react';
import { getCantonById, getProvinceById } from '@/lib/data/cr-geography';
import { coversArea, coverageKey, isFixedWorkplace, type CoverageArea } from '@/lib/public-workplaces';

type Props = {
  workplaces?: CoverageArea[];
  /** Ubicación general del perfil, solo cuando no hay lugares guardados. */
  fallbackLocation?: string;
  video: boolean;
  videoCountry: boolean;
  english: boolean;
};

/**
 * DÓNDE ATIENDE, POR MODALIDAD (pestaña Información del perfil público).
 * Antes era una sola línea en primera persona («Presencial en mi local · A
 * domicilio · Videollamada»), debajo cantones sueltos sin decir si eran el
 * local o la zona, y la videollamada repetida. Ahora cada modalidad lleva su
 * título y lo suyo debajo: los locales con su dirección, las zonas a domicilio
 * y la videollamada. Usa los mismos criterios que el editor del profesional.
 * Devuelve null si no hay nada que mostrar.
 */
export function serviceModalities({ workplaces = [], fallbackLocation = '', video, videoCountry, english }: Props): ReactNode {
  const areaName = (w: CoverageArea) => [
    w.cantonId ? getCantonById(w.cantonId)?.name : '',
    w.provinciaId ? getProvinceById(w.provinciaId)?.name : '',
  ].filter(Boolean).join(', ');

  // Locales: punto exacto y «Recibo clientes», siempre con su dirección (si no
  // la tiene, su cantón). El mismo punto guardado dos veces sale una vez.
  const locales = Array.from(new Map(workplaces
    .filter(w => isFixedWorkplace(w) && w.receivesClients !== false)
    .map(w => {
      const name = String(w.name ?? '').trim();
      const address = String(w.address ?? '').trim();
      const detail = address && address.toLowerCase() !== name.toLowerCase() ? address : areaName(w);
      return [`${w.lat},${w.lng}`, { name: name || detail, detail: name ? detail : '' }] as const;
    })
    .filter(([, w]) => w.name)).values());

  // Zonas a domicilio, nombradas por cantón/provincia (nunca por el nombre de
  // una sede). «Todo Costa Rica» resume a todas las demás.
  const cubiertas = workplaces.filter(coversArea);
  const zonas = cubiertas.some(w => w.level === 'country')
    ? [english ? 'All Costa Rica' : 'Todo Costa Rica']
    : Array.from(new Map(cubiertas.map(w => {
        const province = w.provinciaId ? getProvinceById(w.provinciaId)?.name ?? '' : '';
        const label = w.level === 'provincia'
          ? (province ? `${province} ${english ? '(whole province)' : '(toda la provincia)'}` : '')
          : areaName(w);
        return [coverageKey(w), label] as const;
      }).filter(([, label]) => label)).values());

  const muted = 'block text-sm font-normal leading-snug text-[#52627a]';
  const rows: { key: string; title: string; body?: ReactNode }[] = [];
  if (locales.length) rows.push({
    key: 'local',
    title: english ? (locales.length > 1 ? 'At their locations' : 'At their location') : (locales.length > 1 ? 'En sus locales' : 'En su local'),
    body: <ul className="flex flex-col gap-2.5">{locales.map(l => (
      <li key={`${l.name}|${l.detail}`} className="leading-snug">
        {locales.length > 1 || l.detail ? <span className="block text-sm font-medium text-[#162543]">{l.name}</span> : <span className={muted}>{l.name}</span>}
        {l.detail && <span className={muted}>{l.detail}</span>}
      </li>
    ))}</ul>,
  });
  if (zonas.length) rows.push({
    key: 'domicilio',
    title: english ? 'Comes to you' : 'A domicilio',
    body: <ul className="flex flex-wrap gap-1.5">{zonas.map(z => (
      <li key={z} className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[13px] font-medium leading-tight text-[#3f4c63]">{z}</li>
    ))}</ul>,
  });
  if (video) rows.push({
    key: 'video',
    title: english ? 'By video call' : 'Por videollamada',
    body: videoCountry ? <span className={muted}>{english ? 'Anywhere in Costa Rica' : 'En todo Costa Rica'}</span> : undefined,
  });
  if (!rows.length && !workplaces.length && fallbackLocation) rows.push({ key: 'general', title: fallbackLocation });
  if (!rows.length) return null;

  return (
    <div className="flex flex-col gap-3.5" data-service-modalities>
      {rows.map(m => (
        <div key={m.key} data-service-modality={m.key} className="flex flex-col gap-1.5 [overflow-wrap:anywhere]">
          <span>{m.title}</span>
          {m.body}
        </div>
      ))}
    </div>
  );
}
