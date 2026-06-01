export type ProfessionalCardData = {
  id: string;
  slug: string;
  fullName: string;
  avatarUrl?: string;
  categoryId: string;
  categoryIcon: string;
  bio: string;
  whatsapp: string;
  provinceName: string;
  cantonName: string;
  ratingAvg: number;
  reviewCount: number;
  yearsExperience?: number;
  hourlyRate?: number;
  isVerified: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
};

export const MOCK_PROFESSIONALS: ProfessionalCardData[] = [
  {
    id: "1",
    slug: "mario-vargas-electricista",
    fullName: "Mario Vargas Solano",
    avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg",
    categoryId: "electricidad",
    categoryIcon: "⚡",
    bio: "Electricista certificado con 12 años de experiencia. Instalaciones residenciales y comerciales, paneles eléctricos, cableado estructurado. Trabajo garantizado.",
    whatsapp: "88001122",
    provinceName: "San José",
    cantonName: "Escazú",
    ratingAvg: 4.9,
    reviewCount: 87,
    yearsExperience: 12,
    hourlyRate: 12000,
    isVerified: true,
    isFeatured: true,
    isAvailable: true,
  },
  {
    id: "2",
    slug: "ana-rodriguez-plomera",
    fullName: "Ana Rodríguez Mora",
    avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg",
    categoryId: "plomeria",
    categoryIcon: "🔧",
    bio: "Plomera profesional. Reparación de tuberías, instalación de grifería, tanques, bombas de agua. Atención de emergencias 24/7.",
    whatsapp: "88334455",
    provinceName: "San José",
    cantonName: "Desamparados",
    ratingAvg: 4.7,
    reviewCount: 54,
    yearsExperience: 8,
    hourlyRate: 10000,
    isVerified: true,
    isFeatured: false,
    isAvailable: true,
  },
  {
    id: "3",
    slug: "carlos-jimenez-pintor",
    fullName: "Carlos Jiménez Ulate",
    avatarUrl: "https://randomuser.me/api/portraits/men/55.jpg",
    categoryId: "pintura",
    categoryIcon: "🖌️",
    bio: "Pintura interior y exterior. Presupuesto sin costo. Materiales de primera calidad. Acabados perfectos garantizados. +200 proyectos completados.",
    whatsapp: "77112233",
    provinceName: "Alajuela",
    cantonName: "Alajuela",
    ratingAvg: 4.8,
    reviewCount: 112,
    yearsExperience: 15,
    hourlyRate: 8000,
    isVerified: true,
    isFeatured: false,
    isAvailable: false,
  },
  {
    id: "4",
    slug: "sofia-brenes-tutora",
    fullName: "Sofía Brenes Quesada",
    avatarUrl: "https://randomuser.me/api/portraits/women/28.jpg",
    categoryId: "ensenanza",
    categoryIcon: "📚",
    bio: "Profesora universitaria. Tutorías de matemáticas, física y química para colegiales y universitarios. Clases presenciales y virtuales.",
    whatsapp: "66223344",
    provinceName: "Heredia",
    cantonName: "Heredia",
    ratingAvg: 5.0,
    reviewCount: 43,
    yearsExperience: 6,
    hourlyRate: 15000,
    isVerified: true,
    isFeatured: true,
    isAvailable: true,
  },
  {
    id: "5",
    slug: "roberto-quesada-jardinero",
    fullName: "Roberto Quesada Araya",
    avatarUrl: "https://randomuser.me/api/portraits/men/67.jpg",
    categoryId: "jardineria",
    categoryIcon: "🌿",
    bio: "Diseño y mantenimiento de jardines. Poda de árboles, instalación de riego, césped. Paisajismo residencial y comercial.",
    whatsapp: "88990011",
    provinceName: "Cartago",
    cantonName: "Cartago",
    ratingAvg: 4.6,
    reviewCount: 31,
    yearsExperience: 10,
    hourlyRate: 7000,
    isVerified: false,
    isFeatured: false,
    isAvailable: true,
  },
  {
    id: "6",
    slug: "lucia-campos-disenadora",
    fullName: "Lucía Campos Fallas",
    avatarUrl: "https://randomuser.me/api/portraits/women/62.jpg",
    categoryId: "diseno",
    categoryIcon: "🎨",
    bio: "Diseñadora gráfica y web. Logos, branding, redes sociales, páginas web. Portfolio disponible. Resultados rápidos y creativos.",
    whatsapp: "70001122",
    provinceName: "San José",
    cantonName: "San José",
    ratingAvg: 4.9,
    reviewCount: 76,
    yearsExperience: 7,
    hourlyRate: 20000,
    isVerified: true,
    isFeatured: false,
    isAvailable: true,
  },
];
