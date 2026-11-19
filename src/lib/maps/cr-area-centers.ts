// Centre and bounding box of each province and canton, so the search map can
// focus a location filter WITHOUT a geocoder (Google stays unloaded on map
// pages). Source: OpenStreetMap administrative boundaries via Nominatim
// (queried once on 2026-11-18, © OpenStreetMap contributors, ODbL). Canton
// centres are the boundary centroids, except the seven head cantons, which use
// the city centre people expect. Bounding boxes are clamped to the mainland
// (lat ≥ 8, lng ≥ −86) so Isla del Coco does not zoom Puntarenas out to the ocean.
// Province boxes are the union of their cantons. Coordinates are [lng, lat].

export type AreaView = { center: [number, number]; bbox: [number, number, number, number] };

const AREAS: Record<string, AreaView> = {
  "province:sj": { center: [-84.011, 9.631], bbox: [-84.593, 9.075, -83.429, 10.188] }, // San José
  "province:al": { center: [-84.804, 10.462], bbox: [-85.447, 9.84, -84.161, 11.084] }, // Alajuela
  "province:ca": { center: [-83.702, 9.816], bbox: [-84.088, 9.484, -83.316, 10.147] }, // Cartago
  "province:he": { center: [-83.956, 10.375], bbox: [-84.2, 9.959, -83.711, 10.792] }, // Heredia
  "province:gu": { center: [-85.373, 10.473], bbox: [-85.979, 9.726, -84.766, 11.22] }, // Guanacaste
  "province:pu": { center: [-84.356, 9.168], bbox: [-86.0, 8.0, -82.712, 10.337] }, // Puntarenas
  "province:li": { center: [-83.249, 10.008], bbox: [-83.948, 9.075, -82.551, 10.94] }, // Limón
  "canton:sj-sj": { center: [-84.0800, 9.9325], bbox: [-84.186, 9.807, -83.947, 9.993] }, // San José
  "canton:sj-es": { center: [-84.1410, 9.9160], bbox: [-84.186, 9.86, -84.121, 9.973] }, // Escazú
  "canton:sj-de": { center: [-84.0699, 9.8112], bbox: [-84.109, 9.714, -83.949, 9.909] }, // Desamparados
  "canton:sj-pu": { center: [-84.4094, 9.7334], bbox: [-84.491, 9.556, -84.254, 9.91] }, // Puriscal
  "canton:sj-ta": { center: [-84.0659, 9.5828], bbox: [-84.157, 9.448, -83.972, 9.718] }, // Tarrazú
  "canton:sj-as": { center: [-84.1231, 9.7468], bbox: [-84.225, 9.617, -84.06, 9.876] }, // Aserrí
  "canton:sj-mo": { center: [-84.2387, 9.8727], bbox: [-84.414, 9.809, -84.146, 9.936] }, // Mora
  "canton:sj-go": { center: [-83.9668, 9.9565], bbox: [-84.079, 9.939, -83.887, 9.974] }, // Goicoechea
  "canton:sj-sa": { center: [-84.1916, 9.9180], bbox: [-84.244, 9.863, -84.147, 9.973] }, // Santa Ana
  "canton:sj-al": { center: [-84.1060, 9.8890], bbox: [-84.146, 9.846, -84.084, 9.932] }, // Alajuelita
  "canton:sj-vb": { center: [-83.9759, 10.0761], bbox: [-84.035, 9.964, -83.859, 10.188] }, // Vásquez de Coronado
  "canton:sj-ac": { center: [-84.2432, 9.7426], bbox: [-84.342, 9.623, -84.132, 9.862] }, // Acosta
  "canton:sj-ti": { center: [-84.0822, 9.9571], bbox: [-84.107, 9.942, -84.055, 9.973] }, // Tibás
  "canton:sj-mo2": { center: [-84.0130, 10.0077], bbox: [-84.066, 9.953, -83.975, 10.067] }, // Moravia
  "canton:sj-mu": { center: [-84.0327, 9.9400], bbox: [-84.066, 9.922, -83.957, 9.958] }, // Montes de Oca
  "canton:sj-tu": { center: [-84.5283, 9.7475], bbox: [-84.593, 9.57, -84.402, 9.925] }, // Turrubares
  "canton:sj-da": { center: [-83.8905, 9.5848], bbox: [-83.989, 9.43, -83.758, 9.739] }, // Dota
  "canton:sj-cu": { center: [-84.0308, 9.9162], bbox: [-84.053, 9.894, -84.005, 9.939] }, // Curridabat
  "canton:sj-pm": { center: [-83.6484, 9.3365], bbox: [-84.002, 9.075, -83.429, 9.598] }, // Pérez Zeledón
  "canton:sj-le": { center: [-84.0761, 9.6939], bbox: [-84.154, 9.637, -83.971, 9.751] }, // León Cortés Castro
  "canton:al-al": { center: [-84.2116, 10.0163], bbox: [-84.368, 9.914, -84.161, 10.414] }, // Alajuela
  "canton:al-sa": { center: [-84.5715, 10.2182], bbox: [-84.794, 9.98, -84.415, 10.457] }, // San Ramón
  "canton:al-gr": { center: [-84.2994, 10.0906], bbox: [-84.362, 9.993, -84.23, 10.188] }, // Grecia
  "canton:al-sm": { center: [-84.5319, 9.9605], bbox: [-84.668, 9.906, -84.452, 10.015] }, // San Mateo
  "canton:al-at": { center: [-84.3990, 9.9795], bbox: [-84.469, 9.92, -84.341, 10.039] }, // Atenas
  "canton:al-na": { center: [-84.3995, 10.1055], bbox: [-84.444, 10.018, -84.333, 10.192] }, // Naranjo
  "canton:al-pa": { center: [-84.4356, 10.0465], bbox: [-84.47, 10.007, -84.405, 10.086] }, // Palmares
  "canton:al-po": { center: [-84.2405, 10.1061], bbox: [-84.299, 10.014, -84.196, 10.198] }, // Poás
  "canton:al-oc": { center: [-84.5947, 9.8932], bbox: [-84.69, 9.84, -84.462, 9.946] }, // Orotina
  "canton:al-sc": { center: [-84.4258, 10.6204], bbox: [-84.863, 10.245, -84.161, 10.996] }, // San Carlos
  "canton:al-za": { center: [-84.4175, 10.2189], bbox: [-84.518, 10.167, -84.314, 10.271] }, // Zarcero
  "canton:al-va": { center: [-84.3152, 10.1626], bbox: [-84.362, 10.048, -84.227, 10.277] }, // Sarchí
  "canton:al-up": { center: [-85.1446, 10.8682], bbox: [-85.447, 10.671, -84.878, 11.066] }, // Upala
  "canton:al-lo": { center: [-84.7150, 10.8570], bbox: [-84.896, 10.629, -84.452, 11.084] }, // Los Chiles
  "canton:al-gu": { center: [-84.8408, 10.7036], bbox: [-85.013, 10.556, -84.647, 10.852] }, // Guatuso
  "canton:al-rc": { center: [-84.2155, 10.3444], bbox: [-84.266, 10.242, -84.161, 10.577] }, // Río Cuarto
  "canton:ca-ca": { center: [-83.9194, 9.8644], bbox: [-84.088, 9.604, -83.765, 9.971] }, // Cartago
  "canton:ca-pa": { center: [-83.7737, 9.7313], bbox: [-83.895, 9.551, -83.627, 9.908] }, // Paraíso
  "canton:ca-lu": { center: [-83.9837, 9.9134], bbox: [-84.042, 9.876, -83.948, 9.95] }, // La Unión
  "canton:ca-ji": { center: [-83.7115, 9.8190], bbox: [-83.786, 9.69, -83.599, 9.949] }, // Jiménez
  "canton:ca-tu": { center: [-83.4996, 9.7844], bbox: [-83.819, 9.484, -83.316, 10.084] }, // Turrialba
  "canton:ca-al": { center: [-83.8003, 9.9442], bbox: [-83.843, 9.871, -83.76, 10.017] }, // Alvarado
  "canton:ca-oa": { center: [-83.8459, 9.9974], bbox: [-83.948, 9.848, -83.8, 10.147] }, // Oreamuno
  "canton:ca-el": { center: [-83.9191, 9.7314], bbox: [-84.03, 9.611, -83.79, 9.854] }, // El Guarco
  "canton:he-he": { center: [-84.1170, 9.9985], bbox: [-84.165, 9.959, -83.923, 10.299] }, // Heredia
  "canton:he-ba": { center: [-84.1092, 10.0731], bbox: [-84.146, 10.01, -84.085, 10.137] }, // Barva
  "canton:he-sd": { center: [-84.0651, 9.9880], bbox: [-84.114, 9.96, -84.023, 10.016] }, // Santo Domingo
  "canton:he-sa": { center: [-84.1463, 10.0824], bbox: [-84.174, 10.006, -84.121, 10.158] }, // Santa Bárbara
  "canton:he-sr": { center: [-84.0713, 10.0595], bbox: [-84.119, 9.998, -84.044, 10.121] }, // San Rafael
  "canton:he-si": { center: [-84.0321, 10.0297], bbox: [-84.076, 9.996, -84.01, 10.063] }, // San Isidro
  "canton:he-be": { center: [-84.1856, 9.9793], bbox: [-84.2, 9.966, -84.154, 10.005] }, // Belén
  "canton:he-fl": { center: [-84.1587, 10.0058], bbox: [-84.174, 9.99, -84.134, 10.021] }, // Flores
  "canton:he-sp": { center: [-84.0994, 9.9917], bbox: [-84.114, 9.971, -84.073, 10.013] }, // San Pablo
  "canton:he-sa2": { center: [-83.9957, 10.4872], bbox: [-84.162, 10.182, -83.711, 10.792] }, // Sarapiquí
  "canton:gu-li": { center: [-85.4407, 10.6346], bbox: [-85.699, 10.418, -85.292, 10.965] }, // Liberia
  "canton:gu-ni": { center: [-85.4153, 10.1033], bbox: [-85.697, 9.858, -85.189, 10.347] }, // Nicoya
  "canton:gu-sc": { center: [-85.6700, 10.2358], bbox: [-85.876, 9.983, -85.406, 10.488] }, // Santa Cruz
  "canton:gu-ba": { center: [-85.2845, 10.5131], bbox: [-85.434, 10.25, -85.061, 10.776] }, // Bagaces
  "canton:gu-ca": { center: [-85.6493, 10.4819], bbox: [-85.826, 10.327, -85.369, 10.637] }, // Carrillo
  "canton:gu-ca2": { center: [-85.0934, 10.4464], bbox: [-85.25, 10.183, -84.949, 10.709] }, // Cañas
  "canton:gu-ab": { center: [-85.0209, 10.2493], bbox: [-85.225, 10.109, -84.828, 10.389] }, // Abangares
  "canton:gu-ti": { center: [-84.9009, 10.4832], bbox: [-85.047, 10.321, -84.766, 10.652] }, // Tilarán
  "canton:gu-na": { center: [-85.3300, 9.9013], bbox: [-85.458, 9.726, -85.15, 10.076] }, // Nandayure
  "canton:gu-lc": { center: [-85.5518, 11.0088], bbox: [-85.979, 10.798, -85.23, 11.22] }, // La Cruz
  "canton:gu-ho": { center: [-85.4114, 9.9754], bbox: [-85.497, 9.85, -85.323, 10.101] }, // Hojancha
  "canton:pu-pu": { center: [-84.8384, 9.9763], bbox: [-86.0, 8.0, -84.662, 10.281] }, // Puntarenas
  "canton:pu-es": { center: [-84.6256, 9.9958], bbox: [-84.74, 9.864, -84.553, 10.128] }, // Esparza
  "canton:pu-bv": { center: [-83.2293, 9.0800], bbox: [-83.564, 8.775, -82.948, 9.385] }, // Buenos Aires
  "canton:pu-mo": { center: [-84.7275, 10.1464], bbox: [-84.812, 10.009, -84.657, 10.284] }, // Montes de Oro
  "canton:pu-os": { center: [-83.4070, 8.8914], bbox: [-83.896, 8.502, -83.163, 9.281] }, // Osa
  "canton:pu-ag": { center: [-84.0649, 9.4128], bbox: [-84.254, 9.253, -83.839, 9.572] }, // Quepos
  "canton:pu-ga": { center: [-83.0588, 8.4276], bbox: [-83.336, 8.04, -82.886, 8.814] }, // Golfito
  "canton:pu-cc": { center: [-82.9176, 8.8896], bbox: [-83.107, 8.69, -82.712, 9.089] }, // Coto Brus
  "canton:pu-pa": { center: [-84.3663, 9.5471], bbox: [-84.563, 9.445, -84.13, 9.649] }, // Parrita
  "canton:pu-co": { center: [-82.9468, 8.5378], bbox: [-83.057, 8.342, -82.822, 8.734] }, // Corredores
  "canton:pu-ga2": { center: [-84.6220, 9.7072], bbox: [-84.701, 9.536, -84.529, 9.878] }, // Garabito
  "canton:pu-mv": { center: [-84.8136, 10.2912], bbox: [-84.873, 10.245, -84.771, 10.337] }, // Monteverde
  "canton:pu-pj": { center: [-83.4584, 8.5338], bbox: [-83.65, 8.375, -83.272, 8.693] }, // Puerto Jiménez
  "canton:li-li": { center: [-83.0360, 9.9907], bbox: [-83.516, 9.484, -82.871, 10.068] }, // Limón
  "canton:li-po": { center: [-83.6558, 10.5018], bbox: [-83.948, 10.063, -83.416, 10.94] }, // Pococí
  "canton:li-si": { center: [-83.4816, 10.1494], bbox: [-83.725, 9.982, -83.269, 10.317] }, // Siquirres
  "canton:li-ta": { center: [-83.2082, 9.4221], bbox: [-83.489, 9.075, -82.551, 9.768] }, // Talamanca
  "canton:li-ma": { center: [-83.3395, 10.0098], bbox: [-83.468, 9.798, -83.15, 10.222] }, // Matina
  "canton:li-gu": { center: [-83.6851, 10.2106], bbox: [-83.775, 10.039, -83.342, 10.404] }, // Guácimo
};

/** `province:<id>` or `canton:<id>` (the keys /buscar builds for its focus target). */
export function areaView(key: string): AreaView | null {
  return AREAS[key] ?? null;
}
