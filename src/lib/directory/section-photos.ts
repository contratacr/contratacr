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
};
export function sectionPhoto(section: string, width = 700): string | null {
  const id = IDS[section];
  return id ? U(id, width) : null;
}
