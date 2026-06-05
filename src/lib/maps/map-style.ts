// ContrataCR brand map style — applied to every Google Maps instance.
// Muted grays + soft greens base, soft blue water, hidden POI icons.
// Markers are drawn separately in brand blue (#009FD9).
export const BRAND_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f4f5f3" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  // Hide all points-of-interest icons and most POI labels
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcebd9" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  // Soft green natural landscape
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e6ece4" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#eef0ed" }] },
  // Muted gray roads
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e2e4e1" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d6d9d4" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#eceeeb" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#d6d9d4" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  // Soft blue water
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bcdcef" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7da9c4" }] },
];
