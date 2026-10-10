export function matchesProjectCoverage(row: Record<string,unknown>, province?: string | null, canton?: string | null): boolean {
  if (!province && !canton) return true;
  if (row.coverage_country) return true;
  const provinces = Array.isArray(row.coverage_provincias) ? row.coverage_provincias : [];
  if (province && provinces.includes(province)) return true;
  const zones = [...(Array.isArray(row.workplaces) ? row.workplaces : []),...(Array.isArray(row.coverage_areas) ? row.coverage_areas : [])] as Record<string,unknown>[];
  if (zones.some(zone => zone.level==="country" || (canton ? zone.cantonId===canton : zone.provinciaId===province) || (!zone.cantonId && zone.provinciaId===province))) return true;
  return canton ? row.canton_id===canton : row.provincia_id===province;
}
export function eligibleProjectRecipient(row: Record<string,unknown>, category: string, ownerId?: string | null): boolean {
  const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { is_disabled?: boolean } | null;
  if (!row.profile_id || row.profile_id===ownerId || row.is_banned || row.oculto_del_buscador || row.verification_status==="rejected" || profile?.is_disabled) return false;
  const services = Array.isArray(row.services) ? row.services as Record<string,unknown>[] : [];
  return services.some(service => (service.category===category || (!service.category && row.category_id===category)) && service.active!==false);
}
