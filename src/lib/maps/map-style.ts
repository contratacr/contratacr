// Map style for all Google Maps instances.
// Reverted to the standard Google Maps presentation (greens, blue water, labels)
// per the reference design — we only hide noisy business POI icons so the brand
// pins stay the focus. Markers are drawn separately in brand blue (#009FD9).
export const BRAND_MAP_STYLE = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];
