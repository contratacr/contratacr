export type CategoryItem = {
  id: string;
  label: string;
  keywords: string[];
};

export type CategoryGroup = {
  id: string;
  label: string;
  emoji: string;
  items: CategoryItem[];
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: "hogar",
    label: "Hogar y construcción",
    emoji: "🏠",
    items: [
      { id: "plomeria", label: "Plomería", keywords: ["fontanero", "tuberias", "canerias", "grifo", "fuga", "sanitarios", "agua", "lavamanos", "inodoro"] },
      { id: "electricidad", label: "Electricidad", keywords: ["electricista", "cableado", "circuitos", "enchufes", "apagadores", "tablero", "breaker", "luz"] },
      { id: "construccion", label: "Construcción", keywords: ["albanil", "maestro de obras", "obra", "mamposterita", "concreto", "bloques", "cimientos"] },
      { id: "pintura", label: "Pintura", keywords: ["pintor", "pintura de paredes", "barniz", "repello", "pintura exterior", "empaste"] },
      { id: "carpinteria", label: "Carpintería", keywords: ["carpintero", "muebles de madera", "puertas", "marcos", "cocinas de madera", "closets"] },
      { id: "remodelacion", label: "Remodelación", keywords: ["renovacion", "ampliacion", "mejoras del hogar", "reforma", "renovar"] },
      { id: "techos", label: "Techos y cubiertas", keywords: ["techo", "cubierta", "zinc", "tejas", "goteras", "infiltraciones", "canal", "canaleta"] },
      { id: "pisos", label: "Pisos y revestimientos", keywords: ["piso", "ceramica", "porcelana", "madera", "laminado", "terrazo", "colocar piso"] },
      { id: "impermeabilizacion", label: "Impermeabilización", keywords: ["impermeabilizar", "humedad", "filtraciones", "goteras", "sello", "azotea"] },
      { id: "fumigacion", label: "Fumigación", keywords: ["plagas", "cucarachas", "termitas", "mosquitos", "chinches", "hormigas", "ratones"] },
      { id: "cerrajeria", label: "Cerrajería", keywords: ["cerrajero", "llaves", "candados", "cerradura", "chapas", "seguridad de puertas"] },
      { id: "aire_acondicionado", label: "Aire acondicionado", keywords: ["AC", "climatizacion", "frio", "ventilacion", "HVAC", "refrigeracion"] },
      { id: "calentadores", label: "Calentadores de agua", keywords: ["calentador de agua", "ducha electrica", "calefon", "termotanque"] },
      { id: "ventanas_puertas", label: "Ventanas y puertas", keywords: ["vidrio", "aluminio", "puertas corredizas", "ventaneria", "instalacion de ventanas"] },
      { id: "soldadura", label: "Soldadura", keywords: ["soldador", "hierro", "metal", "estructuras metalicas", "herreria", "rejas"] },
      { id: "gypsum", label: "Gypsum / Drywall", keywords: ["cielo raso", "tabiques", "divisiones", "drywall", "tablaroca", "plycem"] },
      { id: "servicio_gas", label: "Servicio de gas", keywords: ["gas", "cilindro de gas", "tanque de gas", "recarga de gas", "instalacion de gas", "tropigas", "zeta gas", "gas licuado"] },
      { id: "reparacion_electrodomesticos", label: "Reparación de electrodomésticos", keywords: ["electrodomesticos", "refrigeradora", "refri", "lavadora", "secadora", "microondas", "cocina electrica", "lavaplatos", "reparacion de linea blanca"] },
    ],
  },
  {
    id: "jardin",
    label: "Jardín y exterior",
    emoji: "🌿",
    items: [
      { id: "jardineria", label: "Jardinería", keywords: ["jardin", "grama", "plantas", "podado", "mantenimiento de jardin", "cesped", "flores"] },
      { id: "poda_arboles", label: "Poda de árboles", keywords: ["arbol", "poda", "tala", "arborista", "ramas"] },
      { id: "paisajismo", label: "Paisajismo", keywords: ["paisaje", "diseno de jardin", "decoracion exterior", "jardin ornamental"] },
      { id: "limpieza_piscinas", label: "Limpieza de piscinas", keywords: ["piscina", "alberca", "mantenimiento de piscina", "quimica de piscina", "pool"] },
      { id: "riego_automatizado", label: "Riego automatizado", keywords: ["sistema de riego", "aspersor", "goteo", "irrigacion"] },
      { id: "control_plagas", label: "Control de plagas exterior", keywords: ["plagas exterior", "fumigacion exterior", "pesticidas", "herbicidas", "hormiguero"] },
    ],
  },
  {
    id: "limpieza",
    label: "Limpieza",
    emoji: "🧹",
    items: [
      { id: "limpieza", label: "Limpieza del hogar", keywords: ["limpieza de casa", "hogar", "servicio domestico", "empleada", "aseo", "mucama"] },
      { id: "limpieza_oficinas", label: "Limpieza de oficinas", keywords: ["limpieza comercial", "empresa", "edificio", "bodega", "local comercial"] },
      { id: "desinfeccion", label: "Desinfección y sanitización", keywords: ["desinfectante", "esterilizacion", "sanitizacion", "higiene"] },
      { id: "lavado_alfombras", label: "Lavado de alfombras y tapetes", keywords: ["alfombra", "tapete", "moqueta", "steam cleaning", "vapor"] },
      { id: "limpieza_post_construccion", label: "Limpieza post-construcción", keywords: ["obra", "escombros", "construccion", "polvo de obra"] },
      { id: "lavado_vehiculos", label: "Lavado de vehículos", keywords: ["carro", "auto", "lavado", "lavado express", "lavado de carro"] },
    ],
  },
  {
    id: "tecnologia",
    label: "Tecnología",
    emoji: "💻",
    items: [
      { id: "reparacion_computadoras", label: "Reparación de computadoras", keywords: ["computadora", "laptop", "PC", "Mac", "tecnico en computo", "notebook"] },
      { id: "redes_internet", label: "Redes e internet", keywords: ["WiFi", "router", "red", "cableado estructurado", "internet", "fibra"] },
      { id: "camaras_seguridad", label: "Cámaras de seguridad CCTV", keywords: ["CCTV", "vigilancia", "camaras", "circuito cerrado", "DVR", "NVR"] },
      { id: "domotica", label: "Domótica / Smart home", keywords: ["automatizacion del hogar", "smart home", "IoT", "casa inteligente"] },
      { id: "desarrollo_web", label: "Desarrollo web", keywords: ["programador web", "pagina web", "website", "desarrollador", "WordPress", "React", "programacion"] },
      { id: "diseno_grafico", label: "Diseño gráfico", keywords: ["disenador", "logos", "branding", "publicidad", "arte", "identidad visual", "flyers"] },
      { id: "diseno_apps", label: "Diseño de apps", keywords: ["aplicacion movil", "app", "iOS", "Android", "programador", "desarrollo movil"] },
      { id: "soporte_tecnico", label: "Soporte técnico", keywords: ["IT", "soporte", "tecnico", "help desk", "mantenimiento de equipo", "asistencia tecnica"] },
      { id: "impresion_3d", label: "Impresión 3D", keywords: ["impresion tridimensional", "FDM", "prototipo", "modelado 3D"] },
      { id: "audio_video", label: "Audio y video profesional", keywords: ["sonido", "video", "instalacion AV", "pantallas", "proyectores", "sala de cine"] },
    ],
  },
  {
    id: "profesional",
    label: "Servicios profesionales",
    emoji: "💼",
    items: [
      { id: "contabilidad", label: "Contabilidad y finanzas", keywords: ["contador", "CPA", "finanzas", "declaracion de renta", "tributacion", "libros contables", "impuestos", "hacienda"] },
      { id: "legal", label: "Abogados y servicios legales", keywords: ["abogado", "notario", "asesor legal", "juridico", "contratos", "derecho", "bufete", "tramites"] },
      { id: "ingenieria_civil", label: "Ingeniería civil", keywords: ["ingeniero", "estructuras", "planos", "calculo estructural", "obra civil"] },
      { id: "arquitectura", label: "Arquitectura", keywords: ["arquitecto", "diseno arquitectonico", "planos", "renders", "diseño de casa"] },
      { id: "topografia", label: "Topografía", keywords: ["topografo", "levantamiento topografico", "catastro", "mediciones", "plano catastral"] },
      { id: "consultoria", label: "Consultoría empresarial", keywords: ["consultor", "asesor de negocios", "estrategia empresarial", "gestion", "plan de negocios"] },
      { id: "traduccion", label: "Traducción e interpretación", keywords: ["traductor", "interprete", "traduccion", "idiomas", "english", "frances"] },
      { id: "recursos_humanos", label: "Recursos humanos", keywords: ["reclutamiento", "seleccion de personal", "RRHH", "HR", "planilla", "nomina"] },
      { id: "marketing_digital", label: "Marketing digital", keywords: ["community manager", "redes sociales", "publicidad digital", "SEO", "SEM", "Google Ads", "Instagram"] },
      { id: "fotografia", label: "Fotografía profesional", keywords: ["fotografo", "fotografia", "retrato", "foto profesional", "sesion de fotos"] },
      { id: "produccion_video", label: "Producción de video", keywords: ["videografo", "video", "edicion de video", "filmacion", "YouTube", "reels"] },
      { id: "bienes_raices", label: "Bienes raíces", keywords: ["agente inmobiliario", "corredor de propiedades", "compra y venta", "arrendamiento", "alquiler", "propiedades"] },
    ],
  },
  {
    id: "salud",
    label: "Salud y bienestar",
    emoji: "🩺",
    items: [
      { id: "entrenamiento_personal", label: "Entrenamiento personal", keywords: ["entrenador", "personal trainer", "fitness", "gym", "ejercicio", "pesas", "crossfit", "fuerza"] },
      { id: "entrenamiento_deportivo", label: "Entrenamiento deportivo", keywords: ["entrenador de futbol", "coach deportivo", "futbol", "natacion", "tenis", "baloncesto", "deporte", "preparador fisico", "atletismo"] },
      { id: "nutricion", label: "Nutrición y dietética", keywords: ["nutricionista", "dietista", "dieta", "alimentacion saludable", "plan de comida", "bajar de peso"] },
      { id: "masajes", label: "Masajes terapéuticos", keywords: ["masajista", "masaje terapeutico", "relajante", "deportivo", "descontracturante", "reflexologia"] },
      { id: "psicologia", label: "Psicología y terapia", keywords: ["psicologo", "terapeuta", "salud mental", "terapia", "counseling", "ansiedad", "depresion", "bienestar emocional"] },
      { id: "fisioterapia", label: "Fisioterapia", keywords: ["fisioterapeuta", "rehabilitacion", "terapia fisica", "kinesiologia", "dolor de espalda"] },
      { id: "odontologia", label: "Odontología", keywords: ["dentista", "odontologo", "dientes", "muela", "limpieza dental", "ortodoncia", "endodoncia", "caries"] },
      { id: "pediatria", label: "Pediatría", keywords: ["pediatra", "medico de ninos", "salud infantil", "control de nino sano", "vacunas", "bebe"] },
      { id: "optometria", label: "Optometría", keywords: ["optometrista", "examen de la vista", "anteojos", "lentes", "graduacion de lentes", "vision"] },
      { id: "enfermeria", label: "Enfermería a domicilio", keywords: ["enfermero", "enfermera", "cuidados a domicilio", "inyecciones", "curaciones", "sondas"] },
      { id: "medicina_domicilio", label: "Medicina general", keywords: ["doctor", "medico", "medico general", "consulta medica", "medico a domicilio", "visita medica", "medicina general"] },
      { id: "terapia_lenguaje", label: "Terapia del lenguaje", keywords: ["terapeuta del lenguaje", "logopeda", "fonoaudiologo", "lenguaje", "habla", "tartamudez"] },
      { id: "terapia_ocupacional", label: "Terapia ocupacional", keywords: ["terapeuta ocupacional", "terapia ocupacional", "rehabilitacion", "estimulacion", "motora fina"] },
      { id: "podologia", label: "Podología", keywords: ["podologo", "pies", "unas de los pies", "callos", "cuidado de pies", "pie diabetico"] },
      { id: "acupuntura", label: "Acupuntura y medicina alternativa", keywords: ["acupuntura", "medicina alternativa", "medicina china", "agujas", "terapias alternativas", "homeopatia"] },
      { id: "cuidado_adultos", label: "Cuidado de adultos mayores", keywords: ["cuidado de adultos mayores", "anciano", "tercera edad", "acompanante", "cuidador"] },
      { id: "cuidado_discapacidad", label: "Cuidado de personas con discapacidad", keywords: ["cuidador", "discapacidad", "asistente personal", "cuido especial", "necesidades especiales"] },
      { id: "cuidado_infantil", label: "Cuidado infantil / Niñera", keywords: ["ninera", "babysitter", "nanny", "canguro", "cuido de ninos", "guarderia en casa"] },
      { id: "veterinaria", label: "Veterinaria", keywords: ["veterinario", "animales", "mascotas", "perros", "gatos", "clinica veterinaria", "consulta veterinaria"] },
      { id: "peluqueria_canina", label: "Peluquería canina / Grooming", keywords: ["groomer", "grooming", "bano de mascotas", "estetica canina", "perros", "peluqueria de perros"] },
      { id: "cuido_mascotas", label: "Cuido y paseo de mascotas", keywords: ["pet sitting", "paseo de perros", "dog walker", "cuido de mascotas", "guarderia de perros", "cuidador de mascotas"] },
    ],
  },
  {
    id: "belleza",
    label: "Belleza y estética",
    emoji: "💅",
    items: [
      { id: "peluqueria", label: "Peluquería y barbería", keywords: ["barbero", "estilista", "corte de pelo", "cabello", "coloracion", "mechas", "peluquero"] },
      { id: "maquillaje", label: "Maquillaje", keywords: ["maquillista", "makeup", "maquillaje artistico", "novia", "maquillaje de noche"] },
      { id: "unhas", label: "Uñas / Manicure", keywords: ["nail tech", "manicure", "pedicure", "unas acrilicas", "gel", "nail art", "semipermanente"] },
      { id: "pestanas", label: "Pestañas", keywords: ["extensiones de pestanas", "lifting de pestanas", "lash", "laminated"] },
      { id: "depilacion", label: "Depilación", keywords: ["depiladora", "cera", "laser", "hilo", "sugaring", "depilacion definitiva"] },
      { id: "estetica_facial", label: "Estética facial", keywords: ["esteticista", "limpieza facial", "faciales", "tratamientos de piel", "dermapen", "hidrafacial"] },
      { id: "bronceado", label: "Bronceado", keywords: ["autobronceado", "spray tan", "bronceado artificial", "cama de bronceado"] },
    ],
  },
  {
    id: "educacion",
    label: "Educación y clases",
    emoji: "📚",
    items: [
      { id: "tutorias", label: "Tutorías académicas", keywords: ["tutor", "clases particulares", "apoyo escolar", "reforzamiento", "clases de apoyo", "profe particular"] },
      { id: "idiomas", label: "Idiomas", keywords: ["ingles", "espanol", "frances", "mandarin", "profesor de idiomas", "clases de ingles", "English teacher"] },
      { id: "musica", label: "Música e instrumentos", keywords: ["profesor de musica", "guitarra", "piano", "canto", "bateria", "violín", "clases de musica"] },
      { id: "matematicas", label: "Matemáticas y ciencias", keywords: ["matematicas", "fisica", "quimica", "ciencias", "profesor de mate", "algebra", "calculo"] },
      { id: "preparacion_universitaria", label: "Preparación universitaria", keywords: ["preparacion para la UCR", "TEC", "examen de admision", "PICCTT", "admision universitaria"] },
      { id: "clases_manejo", label: "Clases de manejo", keywords: ["conduccion", "licencia", "manejar", "autoescuela", "clase de conducir"] },
      { id: "clases_cocina", label: "Clases de cocina y repostería", keywords: ["chef", "gastronomia", "cocina", "reposteria", "pasteleria", "panaderia"] },
    ],
  },
  {
    id: "transporte",
    label: "Mudanzas y transporte",
    emoji: "🚚",
    items: [
      { id: "mudanzas", label: "Mudanzas", keywords: ["mudanza", "transporte de muebles", "flete", "carga", "camion de mudanza"] },
      { id: "fletes", label: "Fletes y carga", keywords: ["flete", "carga", "transporte de mercancia", "pick up", "camioneta de carga"] },
      { id: "mensajeria", label: "Mensajería y delivery", keywords: ["mensajero", "courier", "entrega", "delivery", "despachos"] },
      { id: "transporte_mascotas", label: "Transporte de mascotas", keywords: ["taxi para mascotas", "traslado de animales", "pet taxi"] },
    ],
  },
  {
    id: "eventos",
    label: "Eventos",
    emoji: "🎉",
    items: [
      { id: "fotografia_eventos", label: "Fotografía de eventos", keywords: ["fotografo de bodas", "quinceaneras", "eventos", "fotografia social", "quinceañera"] },
      { id: "videografia", label: "Videografía de eventos", keywords: ["videografo de bodas", "filmacion de eventos", "video de boda", "video social"] },
      { id: "dj_sonido", label: "DJ y sonido", keywords: ["DJ", "musica para eventos", "sonido", "disc jockey", "equipo de sonido"] },
      { id: "chef", label: "Chef privado y cocina", keywords: ["chef privado", "cocina para eventos", "comida por encargo", "cocinero", "gastronomia", "meal prep", "cena privada", "comida a domicilio"] },
      { id: "catering", label: "Catering y banquetes", keywords: ["comida para eventos", "banquetes", "servicio de alimentacion", "lunch", "buffet"] },
      { id: "decoracion", label: "Decoración de eventos", keywords: ["decorador de eventos", "flores", "globos", "ambientacion", "bodas", "decoracion"] },
      { id: "animacion_infantil", label: "Animación infantil", keywords: ["payaso", "show infantil", "mago", "pinata", "cumpleanos", "shows para ninos"] },
      { id: "bartending", label: "Bartending", keywords: ["bartender", "cocteles", "barra de bebidas", "barman", "cocteleria"] },
    ],
  },
  {
    id: "seguridad",
    label: "Seguridad",
    emoji: "🔐",
    items: [
      { id: "guardas_seguridad", label: "Guardas de seguridad", keywords: ["guarda de seguridad", "vigilante", "seguridad privada", "vigilancia", "condominio"] },
      { id: "alarmas", label: "Instalación de alarmas", keywords: ["alarma de casa", "sistema de seguridad", "sensores", "alarma de robo"] },
      { id: "cctv", label: "Circuito cerrado CCTV", keywords: ["camaras", "circuito cerrado", "vigilancia", "DVR", "monitoreo"] },
      { id: "control_acceso", label: "Control de acceso", keywords: ["control de acceso", "tarjetas de acceso", "biometria", "lector de huella", "porton"] },
    ],
  },
  {
    id: "automotriz",
    label: "Automotriz",
    emoji: "🚗",
    items: [
      { id: "mecanica", label: "Mecánica general", keywords: ["mecanico", "taller", "motor", "frenos", "transmision", "aceite", "servicio de auto"] },
      { id: "hojalateria", label: "Hojalatería y pintura de carros", keywords: ["hojalatero", "latoneria", "carroceria", "abolladuras", "pintura de carro"] },
      { id: "electricidad_automotriz", label: "Electricidad automotriz", keywords: ["electrico automotriz", "bateria", "alternador", "luces del carro"] },
      { id: "tapiceria", label: "Tapicería", keywords: ["tapicero", "asientos", "tela de carro", "cuero", "tapizado"] },
      { id: "detailing", label: "Detailing de autos", keywords: ["detailing", "pulidura", "encerado", "limpieza profunda de auto", "pulir carro"] },
      { id: "cambio_llantas", label: "Cambio de llantas", keywords: ["llantas", "neumaticos", "cambio de caucho", "vulcanizadora", "rin", "goma"] },
    ],
  },
];

/* ─── Flat list of all category items ─── */
export const ALL_CATEGORIES: (CategoryItem & { groupId: string; groupLabel: string })[] =
  CATEGORY_GROUPS.flatMap((g) =>
    g.items.map((item) => ({ ...item, groupId: g.id, groupLabel: g.label }))
  );

/* ─── "Otro" category fallback ─── */
export const OTHER_CATEGORY: CategoryItem = {
  id: "otro",
  label: "Otro servicio",
  keywords: ["otro", "otro servicio", "otra especialidad", "no encontre", "diferente"],
};

/* ─── Normalize text for accent-insensitive comparison ─── */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/* ─── Fuzzy search across all categories by label + keywords ─── */
export function searchCategories(query: string): (CategoryItem & { groupId: string; groupLabel: string })[] {
  if (!query.trim()) return ALL_CATEGORIES;
  const q = normalizeText(query);
  return ALL_CATEGORIES.filter((item) => {
    if (normalizeText(item.label).includes(q)) return true;
    return item.keywords.some((k) => normalizeText(k).includes(q));
  });
}

/* ─── English labels for the fixed taxonomy ───
   Spanish (in CATEGORY_GROUPS above) stays the source of truth; these are the
   per-language English labels so categories/services also render in English.
   Apply everywhere via getCategoryLabel(id, locale) / getCategoryGroupLabel. */
export const CATEGORY_LABELS_EN: Record<string, string> = {
  otro: "Other service",
  // Hogar y construcción
  plomeria: "Plumbing", electricidad: "Electrical", construccion: "Construction",
  pintura: "Painting", carpinteria: "Carpentry", remodelacion: "Remodeling",
  techos: "Roofing", pisos: "Flooring", impermeabilizacion: "Waterproofing",
  fumigacion: "Pest control", cerrajeria: "Locksmith", aire_acondicionado: "Air conditioning",
  calentadores: "Water heaters", ventanas_puertas: "Windows & doors", soldadura: "Welding",
  gypsum: "Gypsum / Drywall", servicio_gas: "Gas service",
  reparacion_electrodomesticos: "Appliance repair",
  // Jardín y exterior
  jardineria: "Gardening", poda_arboles: "Tree pruning", paisajismo: "Landscaping",
  limpieza_piscinas: "Pool cleaning", riego_automatizado: "Automated irrigation",
  control_plagas: "Outdoor pest control",
  // Limpieza
  limpieza: "Home cleaning", limpieza_oficinas: "Office cleaning",
  desinfeccion: "Disinfection & sanitizing", lavado_alfombras: "Carpet & rug cleaning",
  limpieza_post_construccion: "Post-construction cleaning", lavado_vehiculos: "Car washing",
  // Tecnología
  reparacion_computadoras: "Computer repair", redes_internet: "Networks & internet",
  camaras_seguridad: "Security cameras (CCTV)", domotica: "Smart home automation",
  desarrollo_web: "Web development", diseno_grafico: "Graphic design", diseno_apps: "App design",
  soporte_tecnico: "Tech support", audio_video: "Professional audio & video",
  // Servicios profesionales
  contabilidad: "Accounting & finance", legal: "Lawyers & legal services",
  ingenieria_civil: "Civil engineering", arquitectura: "Architecture", topografia: "Surveying",
  consultoria: "Business consulting", traduccion: "Translation & interpreting",
  recursos_humanos: "Human resources", marketing_digital: "Digital marketing",
  fotografia: "Professional photography", produccion_video: "Video production",
  bienes_raices: "Real estate",
  // Salud y bienestar
  entrenamiento_personal: "Personal training", entrenamiento_deportivo: "Sports training",
  nutricion: "Nutrition & dietetics",
  masajes: "Therapeutic massage", psicologia: "Psychology & therapy", fisioterapia: "Physical therapy",
  odontologia: "Dentistry", pediatria: "Pediatrics", optometria: "Optometry",
  enfermeria: "Home nursing", medicina_domicilio: "General medicine",
  terapia_lenguaje: "Speech therapy", terapia_ocupacional: "Occupational therapy",
  podologia: "Podiatry", acupuntura: "Acupuncture & alternative medicine",
  cuidado_adultos: "Elderly care", cuidado_discapacidad: "Disability care",
  cuidado_infantil: "Childcare / Nanny",
  veterinaria: "Veterinary", peluqueria_canina: "Dog grooming", cuido_mascotas: "Pet sitting & dog walking",
  // Belleza y estética
  peluqueria: "Hair & barber", maquillaje: "Makeup", unhas: "Nails / Manicure",
  pestanas: "Eyelashes", depilacion: "Hair removal", estetica_facial: "Facial aesthetics",
  bronceado: "Tanning",
  // Educación y clases
  tutorias: "Academic tutoring", idiomas: "Languages", musica: "Music & instruments",
  matematicas: "Math & science", preparacion_universitaria: "University prep",
  clases_manejo: "Driving lessons", clases_cocina: "Cooking & baking classes",
  // Mudanzas y transporte
  mudanzas: "Moving", fletes: "Freight & hauling", mensajeria: "Courier & delivery",
  transporte_mascotas: "Pet transport",
  // Eventos
  fotografia_eventos: "Event photography", videografia: "Event videography",
  chef: "Private chef & cooking",
  dj_sonido: "DJ & sound", catering: "Catering & banquets", decoracion: "Event decoration",
  animacion_infantil: "Kids entertainment", bartending: "Bartending",
  // Seguridad
  guardas_seguridad: "Security guards", alarmas: "Alarm installation", cctv: "Closed-circuit CCTV",
  control_acceso: "Access control",
  // Automotriz
  mecanica: "General mechanics", hojalateria: "Body work & car painting",
  electricidad_automotriz: "Auto electrical", tapiceria: "Upholstery",
  detailing: "Car detailing", cambio_llantas: "Tire change",
};

export const CATEGORY_GROUP_LABELS_EN: Record<string, string> = {
  hogar: "Home & construction", jardin: "Garden & outdoor", limpieza: "Cleaning",
  tecnologia: "Technology", profesional: "Professional services", salud: "Health & wellness",
  belleza: "Beauty & aesthetics", educacion: "Education & classes",
  transporte: "Moving & transport", eventos: "Events", seguridad: "Security",
  automotriz: "Automotive",
};

/* ─── Get category label from ID (locale-aware) ─── */
export function getCategoryLabel(id: string, locale?: string): string {
  if (locale === "en" && CATEGORY_LABELS_EN[id]) return CATEGORY_LABELS_EN[id];
  if (id === "otro") return locale === "en" ? "Other service" : "Otro servicio";
  const found = ALL_CATEGORIES.find((c) => c.id === id);
  if (found) return found.label;
  // Unknown id → a readable label (never the raw key), and a warning to catch it.
  if (id) console.warn(`[categories] unknown category id "${id}" — add it to the taxonomy + messages`);
  return id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* ─── Get category GROUP label from group ID (locale-aware) ─── */
export function getCategoryGroupLabel(groupId: string, locale?: string): string {
  if (locale === "en" && CATEGORY_GROUP_LABELS_EN[groupId]) return CATEGORY_GROUP_LABELS_EN[groupId];
  const g = CATEGORY_GROUPS.find((x) => x.id === groupId);
  return g?.label ?? groupId;
}

/* ─── Health categories (es_salud) — drive DOB behaviour. AUTHORITATIVE flag,
   never inferred from names; mirrors categories.es_salud in the DB (migration 036).
   Only HEALTH/medical services where the patient's age matters. ─── */
export const HEALTH_CATEGORY_IDS = new Set<string>([
  "entrenamiento_personal", "nutricion", "masajes", "psicologia", "fisioterapia",
  "odontologia", "pediatria", "optometria",
  "enfermeria", "medicina_domicilio", "terapia_lenguaje", "terapia_ocupacional",
  "podologia", "acupuntura", "cuidado_adultos", "cuidado_discapacidad", "cuidado_infantil",
]);

/** True if the category is a health/medical category (DOB relevant). */
export function isHealthCategory(id?: string | null): boolean {
  return !!id && HEALTH_CATEGORY_IDS.has(id);
}

/** True if ANY of the professional's categories is a health category. */
export function anyHealthCategory(ids?: (string | null | undefined)[]): boolean {
  return (ids ?? []).some((id) => isHealthCategory(id));
}

/* ─── Get category IDs that match a text query (for search page) ─── */
export function getMatchingCategoryIds(query: string): string[] {
  if (!query.trim()) return [];
  return searchCategories(query).map((c) => c.id);
}

/* ─── Legacy flat CATEGORIES array (kept for backwards compat) ─── */
export const CATEGORIES = ALL_CATEGORIES.map(({ id, keywords }) => ({
  id,
  icon: "",
  keywords,
}));
