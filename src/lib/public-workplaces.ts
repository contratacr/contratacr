/** Exact pins represent fixed workplaces; coverage never becomes a public address. */
export type PublicWorkplace = { id?: string; name?: string; address?: string; lat?: number; lng?: number; level?: string; showAddress?: boolean };
export function isFixedWorkplace(w: PublicWorkplace): boolean {
  return w.level !== 'country' && w.level !== 'provincia' && typeof w.lat === 'number' && Number.isFinite(w.lat) && Math.abs(w.lat) <= 90 && typeof w.lng === 'number' && Number.isFinite(w.lng) && Math.abs(w.lng) <= 180;
}
export function publicWorkplaces(places: PublicWorkplace[] = []): PublicWorkplace[] {
  const seen = new Set<string>();
  return places.filter(w => {
    if (!isFixedWorkplace(w) || w.showAddress === false) return false;
    const key = `${w.lat},${w.lng}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function directionsUrl(w: PublicWorkplace): string | null {
  if (!isFixedWorkplace(w) || w.showAddress === false) return null;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: `${w.lat},${w.lng}` })}`;
}

export function wazeUrl(w: PublicWorkplace): string | null {
  if (!isFixedWorkplace(w) || w.showAddress === false) return null;
  return `https://www.waze.com/ul?${new URLSearchParams({ ll: `${w.lat},${w.lng}`, navigate: 'yes' })}`;
}
