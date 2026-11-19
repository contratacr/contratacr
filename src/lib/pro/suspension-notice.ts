// Copy for the «profile suspended» notice on /dashboard/profesional (ES «usted» + EN).
// requirePro sends a banned/suspended professional here, so the notice must render at every width
// (it used to live inside the home card, which is `lg:hidden`, so desktop showed nothing).
export type SuspensionNoticeCopy = { title: string; body: string; cta: string };
export function suspensionNoticeCopy(locale: string, reason?: string | null): SuspensionNoticeCopy {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (locale === 'en') return {
    title: 'Your profile is suspended',
    body: 'It does not appear in search results or on the map, and nobody can see your contact details. Pro tools are unavailable while the suspension lasts.' + (why ? ` Reason: ${why}` : ''),
    cta: 'If you think this is a mistake, write to us',
  };
  return {
    title: 'Su perfil está suspendido',
    body: 'No aparece en las búsquedas ni en el mapa, y nadie puede ver sus datos de contacto. Las herramientas Pro no están disponibles mientras dure la suspensión.' + (why ? ` Motivo: ${why}` : ''),
    cta: 'Si cree que es un error, escríbanos',
  };
}
