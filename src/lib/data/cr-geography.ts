export type Provincia = {
  id: string;
  name: string;
  cantones: Canton[];
};

export type Canton = {
  id: string;
  name: string;
  provinciaId: string;
};

export const PROVINCIAS: Provincia[] = [
  {
    id: "sj",
    name: "San José",
    cantones: [
      { id: "sj-sj", name: "San José", provinciaId: "sj" },
      { id: "sj-es", name: "Escazú", provinciaId: "sj" },
      { id: "sj-de", name: "Desamparados", provinciaId: "sj" },
      { id: "sj-pu", name: "Puriscal", provinciaId: "sj" },
      { id: "sj-ta", name: "Tarrazú", provinciaId: "sj" },
      { id: "sj-as", name: "Aserrí", provinciaId: "sj" },
      { id: "sj-mo", name: "Mora", provinciaId: "sj" },
      { id: "sj-go", name: "Goicoechea", provinciaId: "sj" },
      { id: "sj-sa", name: "Santa Ana", provinciaId: "sj" },
      { id: "sj-al", name: "Alajuelita", provinciaId: "sj" },
      { id: "sj-vb", name: "Vásquez de Coronado", provinciaId: "sj" },
      { id: "sj-ac", name: "Acosta", provinciaId: "sj" },
      { id: "sj-ti", name: "Tibás", provinciaId: "sj" },
      { id: "sj-mo2", name: "Moravia", provinciaId: "sj" },
      { id: "sj-mu", name: "Montes de Oca", provinciaId: "sj" },
      { id: "sj-tu", name: "Turrubares", provinciaId: "sj" },
      { id: "sj-da", name: "Dota", provinciaId: "sj" },
      { id: "sj-cu", name: "Curridabat", provinciaId: "sj" },
      { id: "sj-pm", name: "Pérez Zeledón", provinciaId: "sj" },
      { id: "sj-le", name: "León Cortés Castro", provinciaId: "sj" },
    ],
  },
  {
    id: "al",
    name: "Alajuela",
    cantones: [
      { id: "al-al", name: "Alajuela", provinciaId: "al" },
      { id: "al-sa", name: "San Ramón", provinciaId: "al" },
      { id: "al-gr", name: "Grecia", provinciaId: "al" },
      { id: "al-sm", name: "San Mateo", provinciaId: "al" },
      { id: "al-at", name: "Atenas", provinciaId: "al" },
      { id: "al-na", name: "Naranjo", provinciaId: "al" },
      { id: "al-pa", name: "Palmares", provinciaId: "al" },
      { id: "al-po", name: "Poás", provinciaId: "al" },
      { id: "al-oc", name: "Orotina", provinciaId: "al" },
      { id: "al-sc", name: "San Carlos", provinciaId: "al" },
      { id: "al-za", name: "Zarcero", provinciaId: "al" },
      { id: "al-va", name: "Valverde Vega", provinciaId: "al" },
      { id: "al-up", name: "Upala", provinciaId: "al" },
      { id: "al-lo", name: "Los Chiles", provinciaId: "al" },
      { id: "al-gu", name: "Guatuso", provinciaId: "al" },
    ],
  },
  {
    id: "ca",
    name: "Cartago",
    cantones: [
      { id: "ca-ca", name: "Cartago", provinciaId: "ca" },
      { id: "ca-pa", name: "Paraíso", provinciaId: "ca" },
      { id: "ca-lu", name: "La Unión", provinciaId: "ca" },
      { id: "ca-ji", name: "Jiménez", provinciaId: "ca" },
      { id: "ca-tu", name: "Turrialba", provinciaId: "ca" },
      { id: "ca-al", name: "Alvarado", provinciaId: "ca" },
      { id: "ca-oa", name: "Oreamuno", provinciaId: "ca" },
      { id: "ca-el", name: "El Guarco", provinciaId: "ca" },
    ],
  },
  {
    id: "he",
    name: "Heredia",
    cantones: [
      { id: "he-he", name: "Heredia", provinciaId: "he" },
      { id: "he-ba", name: "Barva", provinciaId: "he" },
      { id: "he-sd", name: "Santo Domingo", provinciaId: "he" },
      { id: "he-sa", name: "Santa Bárbara", provinciaId: "he" },
      { id: "he-sr", name: "San Rafael", provinciaId: "he" },
      { id: "he-si", name: "San Isidro", provinciaId: "he" },
      { id: "he-be", name: "Belén", provinciaId: "he" },
      { id: "he-fl", name: "Flores", provinciaId: "he" },
      { id: "he-sp", name: "San Pablo", provinciaId: "he" },
      { id: "he-sa2", name: "Sarapiquí", provinciaId: "he" },
    ],
  },
  {
    id: "gu",
    name: "Guanacaste",
    cantones: [
      { id: "gu-li", name: "Liberia", provinciaId: "gu" },
      { id: "gu-ni", name: "Nicoya", provinciaId: "gu" },
      { id: "gu-sc", name: "Santa Cruz", provinciaId: "gu" },
      { id: "gu-ba", name: "Bagaces", provinciaId: "gu" },
      { id: "gu-ca", name: "Carrillo", provinciaId: "gu" },
      { id: "gu-ca2", name: "Cañas", provinciaId: "gu" },
      { id: "gu-ab", name: "Abangares", provinciaId: "gu" },
      { id: "gu-ti", name: "Tilarán", provinciaId: "gu" },
      { id: "gu-na", name: "Nandayure", provinciaId: "gu" },
      { id: "gu-lc", name: "La Cruz", provinciaId: "gu" },
      { id: "gu-ho", name: "Hojancha", provinciaId: "gu" },
    ],
  },
  {
    id: "pu",
    name: "Puntarenas",
    cantones: [
      { id: "pu-pu", name: "Puntarenas", provinciaId: "pu" },
      { id: "pu-es", name: "Esparza", provinciaId: "pu" },
      { id: "pu-bv", name: "Buenos Aires", provinciaId: "pu" },
      { id: "pu-mo", name: "Montes de Oro", provinciaId: "pu" },
      { id: "pu-os", name: "Osa", provinciaId: "pu" },
      { id: "pu-ag", name: "Aguirre", provinciaId: "pu" },
      { id: "pu-ga", name: "Golfito", provinciaId: "pu" },
      { id: "pu-cc", name: "Coto Brus", provinciaId: "pu" },
      { id: "pu-pa", name: "Parrita", provinciaId: "pu" },
      { id: "pu-co", name: "Corredores", provinciaId: "pu" },
      { id: "pu-ga2", name: "Garabito", provinciaId: "pu" },
    ],
  },
  {
    id: "li",
    name: "Limón",
    cantones: [
      { id: "li-li", name: "Limón", provinciaId: "li" },
      { id: "li-po", name: "Pococí", provinciaId: "li" },
      { id: "li-si", name: "Siquirres", provinciaId: "li" },
      { id: "li-ta", name: "Talamanca", provinciaId: "li" },
      { id: "li-ma", name: "Matina", provinciaId: "li" },
      { id: "li-gu", name: "Guácimo", provinciaId: "li" },
    ],
  },
];

export const CATEGORIES = [
  { id: "plomeria", name: "Plomería", icon: "🔧", color: "blue" },
  { id: "electricidad", name: "Electricidad", icon: "⚡", color: "yellow" },
  { id: "construccion", name: "Construcción", icon: "🏗️", color: "orange" },
  { id: "pintura", name: "Pintura", icon: "🖌️", color: "purple" },
  { id: "jardineria", name: "Jardinería", icon: "🌿", color: "green" },
  { id: "limpieza", name: "Limpieza", icon: "🧹", color: "teal" },
  { id: "carpinteria", name: "Carpintería", icon: "🪵", color: "amber" },
  { id: "tecnologia", name: "Tecnología / TI", icon: "💻", color: "indigo" },
  { id: "ensenanza", name: "Enseñanza / Tutorías", icon: "📚", color: "rose" },
  { id: "belleza", name: "Belleza / Estética", icon: "💅", color: "pink" },
  { id: "mascotas", name: "Veterinaria / Mascotas", icon: "🐾", color: "emerald" },
  { id: "mecanica", name: "Mecánica", icon: "🔩", color: "slate" },
  { id: "mudanzas", name: "Mudanzas", icon: "📦", color: "cyan" },
  { id: "seguridad", name: "Seguridad", icon: "🔐", color: "red" },
  { id: "contabilidad", name: "Contabilidad / Legal", icon: "📊", color: "violet" },
  { id: "diseno", name: "Diseño / Arte", icon: "🎨", color: "fuchsia" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function getCantonsByProvincia(provinciaId: string): Canton[] {
  return PROVINCIAS.find((p) => p.id === provinciaId)?.cantones ?? [];
}

export function getProvinciaById(id: string): Provincia | undefined {
  return PROVINCIAS.find((p) => p.id === id);
}

export function getCantonById(id: string): Canton | undefined {
  for (const provincia of PROVINCIAS) {
    const canton = provincia.cantones.find((c) => c.id === id);
    if (canton) return canton;
  }
  return undefined;
}
