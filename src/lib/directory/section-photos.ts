// Real, licence-free photos for the business sections (Unsplash CDN, like the production service cards), no visible
// commercial brands. Used by the home «Categorías» and the /categorias tiles (owner 2026-11-26).
const U = (id: string, w = 700) => `https://images.unsplash.com/photo-${id}?w=${w}&auto=format&fit=crop&q=70`;
const IDS: Record<string, string> = {
  restaurantes: "1517248135467-4c7edcad34c4",
  cafes: "1495474472287-4d71bcdd2085",
  supermercados: "1542838132-92c53300491e",
  pulperias: "1604719312566-8912e9227c6a",
  ferreterias: "1581783898377-1c85bf937427",
  farmacias: "1576602976047-174e57a47881",
  gasolineras: "1527018601619-a508a2be00cd",
  talleres: "1487754180451-c456f719a1fc",
  bancos: "1601597111158-2fceff292cdc",
  hospedaje: "1566073771259-6a8506099945",
  tours: "1519046904884-53103b34b206",
  salud: "1519494026892-80bbd2d6fd0d",
  gimnasios: "1534438327276-14e5300c3a48",
  veterinarias: "1628009368231-7bb7cfcb0def",
  belleza: "1560066984-138dadb4c035",
  parqueos: "1470224114660-3f6686c562eb", // parqueo con líneas amarillas, sin marcas (2026-11-26)
  lavacar: "1754296577179-0e14f78a1262", // carro cubierto de espuma, sin logotipo visible (2026-11-26)
  // 2026-11-26 (migration 537), all HTTP 200 and without visible brands:
  atracciones: "1432405972618-c60b0225b8f9", // catarata en el bosque
  tiendas: "1528698827591-e19ccd7bc23d", // vitrina de una tienda con bicicleta, sin rótulo
  "centros-comerciales": "1567958451986-2de427a4a0be", // interior de tienda por departamentos, sin rótulos legibles
  "mercados-y-carnicerias": "1488459716781-31db52582fe9", // puesto de mercado con frutas y verduras
  tramites: "1555848962-6e79363ec58f", // sala de sesiones de un edificio público
  educacion: "1541339907198-e08756dedf3f", // graduación, birretes al aire
  transporte: "1544620347-c4fd4a3d5957", // autobús de pasajeros
  bares: "1514362545857-3bc16c4c7d1b", // barra de bar (la misma foto de Bartending); tarjeta "Bares" de Cafés y bares
};
export function sectionPhoto(section: string, width = 700): string | null {
  const id = IDS[section];
  return id ? U(id, width) : null;
}
