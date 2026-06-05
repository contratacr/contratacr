export type Province = {
  id: string;
  name: string;
  cantons: Canton[];
};

export type Canton = {
  id: string;
  name: string;
  provinceId: string;
};

export const PROVINCES: Province[] = [
  {
    id: "sj",
    name: "San José",
    cantons: [
      { id: "sj-sj", name: "San José", provinceId: "sj" },
      { id: "sj-es", name: "Escazú", provinceId: "sj" },
      { id: "sj-de", name: "Desamparados", provinceId: "sj" },
      { id: "sj-pu", name: "Puriscal", provinceId: "sj" },
      { id: "sj-ta", name: "Tarrazú", provinceId: "sj" },
      { id: "sj-as", name: "Aserrí", provinceId: "sj" },
      { id: "sj-mo", name: "Mora", provinceId: "sj" },
      { id: "sj-go", name: "Goicoechea", provinceId: "sj" },
      { id: "sj-sa", name: "Santa Ana", provinceId: "sj" },
      { id: "sj-al", name: "Alajuelita", provinceId: "sj" },
      { id: "sj-vb", name: "Vásquez de Coronado", provinceId: "sj" },
      { id: "sj-ac", name: "Acosta", provinceId: "sj" },
      { id: "sj-ti", name: "Tibás", provinceId: "sj" },
      { id: "sj-mo2", name: "Moravia", provinceId: "sj" },
      { id: "sj-mu", name: "Montes de Oca", provinceId: "sj" },
      { id: "sj-tu", name: "Turrubares", provinceId: "sj" },
      { id: "sj-da", name: "Dota", provinceId: "sj" },
      { id: "sj-cu", name: "Curridabat", provinceId: "sj" },
      { id: "sj-pm", name: "Pérez Zeledón", provinceId: "sj" },
      { id: "sj-le", name: "León Cortés Castro", provinceId: "sj" },
    ],
  },
  {
    id: "al",
    name: "Alajuela",
    cantons: [
      { id: "al-al", name: "Alajuela", provinceId: "al" },
      { id: "al-sa", name: "San Ramón", provinceId: "al" },
      { id: "al-gr", name: "Grecia", provinceId: "al" },
      { id: "al-sm", name: "San Mateo", provinceId: "al" },
      { id: "al-at", name: "Atenas", provinceId: "al" },
      { id: "al-na", name: "Naranjo", provinceId: "al" },
      { id: "al-pa", name: "Palmares", provinceId: "al" },
      { id: "al-po", name: "Poás", provinceId: "al" },
      { id: "al-oc", name: "Orotina", provinceId: "al" },
      { id: "al-sc", name: "San Carlos", provinceId: "al" },
      { id: "al-za", name: "Zarcero", provinceId: "al" },
      { id: "al-va", name: "Sarchí", provinceId: "al" },
      { id: "al-up", name: "Upala", provinceId: "al" },
      { id: "al-lo", name: "Los Chiles", provinceId: "al" },
      { id: "al-gu", name: "Guatuso", provinceId: "al" },
      { id: "al-rc", name: "Río Cuarto", provinceId: "al" },
    ],
  },
  {
    id: "ca",
    name: "Cartago",
    cantons: [
      { id: "ca-ca", name: "Cartago", provinceId: "ca" },
      { id: "ca-pa", name: "Paraíso", provinceId: "ca" },
      { id: "ca-lu", name: "La Unión", provinceId: "ca" },
      { id: "ca-ji", name: "Jiménez", provinceId: "ca" },
      { id: "ca-tu", name: "Turrialba", provinceId: "ca" },
      { id: "ca-al", name: "Alvarado", provinceId: "ca" },
      { id: "ca-oa", name: "Oreamuno", provinceId: "ca" },
      { id: "ca-el", name: "El Guarco", provinceId: "ca" },
    ],
  },
  {
    id: "he",
    name: "Heredia",
    cantons: [
      { id: "he-he", name: "Heredia", provinceId: "he" },
      { id: "he-ba", name: "Barva", provinceId: "he" },
      { id: "he-sd", name: "Santo Domingo", provinceId: "he" },
      { id: "he-sa", name: "Santa Bárbara", provinceId: "he" },
      { id: "he-sr", name: "San Rafael", provinceId: "he" },
      { id: "he-si", name: "San Isidro", provinceId: "he" },
      { id: "he-be", name: "Belén", provinceId: "he" },
      { id: "he-fl", name: "Flores", provinceId: "he" },
      { id: "he-sp", name: "San Pablo", provinceId: "he" },
      { id: "he-sa2", name: "Sarapiquí", provinceId: "he" },
    ],
  },
  {
    id: "gu",
    name: "Guanacaste",
    cantons: [
      { id: "gu-li", name: "Liberia", provinceId: "gu" },
      { id: "gu-ni", name: "Nicoya", provinceId: "gu" },
      { id: "gu-sc", name: "Santa Cruz", provinceId: "gu" },
      { id: "gu-ba", name: "Bagaces", provinceId: "gu" },
      { id: "gu-ca", name: "Carrillo", provinceId: "gu" },
      { id: "gu-ca2", name: "Cañas", provinceId: "gu" },
      { id: "gu-ab", name: "Abangares", provinceId: "gu" },
      { id: "gu-ti", name: "Tilarán", provinceId: "gu" },
      { id: "gu-na", name: "Nandayure", provinceId: "gu" },
      { id: "gu-lc", name: "La Cruz", provinceId: "gu" },
      { id: "gu-ho", name: "Hojancha", provinceId: "gu" },
    ],
  },
  {
    id: "pu",
    name: "Puntarenas",
    cantons: [
      { id: "pu-pu", name: "Puntarenas", provinceId: "pu" },
      { id: "pu-es", name: "Esparza", provinceId: "pu" },
      { id: "pu-bv", name: "Buenos Aires", provinceId: "pu" },
      { id: "pu-mo", name: "Montes de Oro", provinceId: "pu" },
      { id: "pu-os", name: "Osa", provinceId: "pu" },
      { id: "pu-ag", name: "Quepos", provinceId: "pu" },
      { id: "pu-ga", name: "Golfito", provinceId: "pu" },
      { id: "pu-cc", name: "Coto Brus", provinceId: "pu" },
      { id: "pu-pa", name: "Parrita", provinceId: "pu" },
      { id: "pu-co", name: "Corredores", provinceId: "pu" },
      { id: "pu-ga2", name: "Garabito", provinceId: "pu" },
      { id: "pu-mv", name: "Monteverde", provinceId: "pu" },
      { id: "pu-pj", name: "Puerto Jiménez", provinceId: "pu" },
    ],
  },
  {
    id: "li",
    name: "Limón",
    cantons: [
      { id: "li-li", name: "Limón", provinceId: "li" },
      { id: "li-po", name: "Pococí", provinceId: "li" },
      { id: "li-si", name: "Siquirres", provinceId: "li" },
      { id: "li-ta", name: "Talamanca", provinceId: "li" },
      { id: "li-ma", name: "Matina", provinceId: "li" },
      { id: "li-gu", name: "Guácimo", provinceId: "li" },
    ],
  },
];

export const CATEGORIES = [
  // HOGAR Y CONSTRUCCIÓN
  { id: "plomeria", icon: "" },
  { id: "electricidad", icon: "" },
  { id: "construccion", icon: "" },
  { id: "pintura", icon: "" },
  { id: "carpinteria", icon: "" },
  { id: "remodelacion", icon: "" },
  { id: "techos", icon: "" },
  { id: "pisos", icon: "" },
  { id: "impermeabilizacion", icon: "" },
  { id: "fumigacion", icon: "" },
  { id: "cerrajeria", icon: "" },
  { id: "aire_acondicionado", icon: "" },
  { id: "calentadores", icon: "" },
  { id: "ventanas_puertas", icon: "" },
  { id: "soldadura", icon: "" },
  { id: "gypsum", icon: "" },
  // JARDÍN Y EXTERIOR
  { id: "jardineria", icon: "" },
  { id: "poda_arboles", icon: "" },
  { id: "paisajismo", icon: "" },
  { id: "limpieza_piscinas", icon: "" },
  { id: "riego_automatizado", icon: "" },
  { id: "control_plagas", icon: "" },
  // LIMPIEZA
  { id: "limpieza", icon: "" },
  { id: "limpieza_oficinas", icon: "" },
  { id: "desinfeccion", icon: "" },
  { id: "lavado_alfombras", icon: "" },
  { id: "limpieza_post_construccion", icon: "" },
  { id: "lavado_vehiculos", icon: "" },
  // TECNOLOGÍA
  { id: "reparacion_computadoras", icon: "" },
  { id: "redes_internet", icon: "" },
  { id: "camaras_seguridad", icon: "" },
  { id: "domotica", icon: "" },
  { id: "desarrollo_web", icon: "" },
  { id: "diseno_grafico", icon: "" },
  { id: "diseno_apps", icon: "" },
  { id: "soporte_tecnico", icon: "" },
  { id: "impresion_3d", icon: "" },
  { id: "audio_video", icon: "" },
  // SERVICIOS PROFESIONALES
  { id: "contabilidad", icon: "" },
  { id: "legal", icon: "" },
  { id: "ingenieria_civil", icon: "" },
  { id: "arquitectura", icon: "" },
  { id: "topografia", icon: "" },
  { id: "consultoria", icon: "" },
  { id: "traduccion", icon: "" },
  { id: "recursos_humanos", icon: "" },
  { id: "marketing_digital", icon: "" },
  { id: "fotografia", icon: "" },
  { id: "produccion_video", icon: "" },
  { id: "bienes_raices", icon: "" },
  // SALUD Y BIENESTAR
  { id: "entrenamiento_personal", icon: "" },
  { id: "nutricion", icon: "" },
  { id: "masajes", icon: "" },
  { id: "psicologia", icon: "" },
  { id: "fisioterapia", icon: "" },
  { id: "enfermeria", icon: "" },
  { id: "cuidado_adultos", icon: "" },
  { id: "cuidado_infantil", icon: "" },
  { id: "veterinaria", icon: "" },
  { id: "peluqueria_canina", icon: "" },
  // BELLEZA Y ESTÉTICA
  { id: "peluqueria", icon: "" },
  { id: "maquillaje", icon: "" },
  { id: "unhas", icon: "" },
  { id: "pestanas", icon: "" },
  { id: "depilacion", icon: "" },
  { id: "estetica_facial", icon: "" },
  { id: "bronceado", icon: "" },
  // EDUCACIÓN
  { id: "tutorias", icon: "" },
  { id: "idiomas", icon: "" },
  { id: "musica", icon: "" },
  { id: "matematicas", icon: "" },
  { id: "preparacion_universitaria", icon: "" },
  { id: "clases_manejo", icon: "" },
  { id: "clases_cocina", icon: "" },
  // MUDANZAS Y TRANSPORTE
  { id: "mudanzas", icon: "" },
  { id: "fletes", icon: "" },
  { id: "mensajeria", icon: "" },
  { id: "transporte_mascotas", icon: "" },
  // EVENTOS
  { id: "fotografia_eventos", icon: "" },
  { id: "videografia", icon: "" },
  { id: "dj_sonido", icon: "" },
  { id: "catering", icon: "" },
  { id: "decoracion", icon: "" },
  { id: "animacion_infantil", icon: "" },
  { id: "bartending", icon: "" },
  // SEGURIDAD
  { id: "guardas_seguridad", icon: "" },
  { id: "alarmas", icon: "" },
  { id: "cctv", icon: "" },
  { id: "control_acceso", icon: "" },
  // AUTOMOTRIZ
  { id: "mecanica", icon: "" },
  { id: "hojalateria", icon: "" },
  { id: "electricidad_automotriz", icon: "" },
  { id: "tapiceria", icon: "" },
  { id: "detailing", icon: "" },
  { id: "cambio_llantas", icon: "" },
  // Legacy IDs kept for backwards compatibility
  { id: "seguridad", icon: "" },
  { id: "tecnologia", icon: "" },
  { id: "ensenanza", icon: "" },
  { id: "belleza", icon: "" },
  { id: "mascotas", icon: "" },
  { id: "diseno", icon: "" },
  { id: "diseno_interiores", icon: "" },
  { id: "herreria", icon: "" },
  { id: "chapisteria", icon: "" },
  { id: "eventos", icon: "" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function getCantonsByProvince(provinceId: string): Canton[] {
  return PROVINCES.find((p) => p.id === provinceId)?.cantons ?? [];
}

export function getProvinceById(id: string): Province | undefined {
  return PROVINCES.find((p) => p.id === id);
}

export function getCantonById(id: string): Canton | undefined {
  for (const province of PROVINCES) {
    const canton = province.cantons.find((c) => c.id === id);
    if (canton) return canton;
  }
  return undefined;
}
