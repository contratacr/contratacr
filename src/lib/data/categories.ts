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

export const CATEGORY_GROUP_ICON_KEYS: Record<string, string> = {
  hogar: "home",
  jardin: "leaf",
  limpieza: "sparkles",
  tecnologia: "laptop",
  profesional: "briefcase",
  salud: "heart",
  belleza: "star",
  moda_y_cuidado_personal: "shirt",
  educacion: "book-open",
  transporte: "truck",
  eventos: "calendar-days",
  seguridad: "shield",
  automotriz: "car",
  turismo: "map",
  otras: "tag",
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: "hogar",
    label: "Hogar y construcción",
    emoji: "🏠",
    items: [
      { id: "plomeria", label: "Plomería", keywords: ["fontanero", "tuberias", "canerias", "grifo", "fuga", "sanitarios", "agua", "lavamanos", "inodoro"] },
      { id: "electricidad", label: "Electricidad", keywords: ["electricista", "cableado", "circuitos", "enchufes", "apagadores", "tablero", "breaker", "luz"] },
      { id: "construccion", label: "Construcción", keywords: ["albanil", "constructor", "obra", "mamposterita", "concreto", "bloques", "cimientos"] },
      { id: "maestro_obras", label: "Maestro de obras", keywords: ["maestro de obra", "encargado de obra", "supervision de obra", "construccion", "remodelacion"] },
      { id: "pintura", label: "Pintura", keywords: ["pintor", "pintura de paredes", "barniz", "repello", "pintura exterior", "empaste"] },
      { id: "carpinteria", label: "Carpintería", keywords: ["carpintero", "muebles de madera", "puertas", "marcos", "cocinas de madera", "closets"] },
      { id: "ebanisteria", label: "Ebanistería", keywords: ["ebanista", "muebles finos", "muebles a la medida", "madera fina", "ebanistero"] },
      { id: "remodelacion", label: "Remodelación", keywords: ["renovacion", "ampliacion", "mejoras del hogar", "reforma", "renovar"] },
      { id: "techos", label: "Techos y cubiertas", keywords: ["techo", "cubierta", "zinc", "tejas", "goteras", "infiltraciones", "canal", "canaleta"] },
      { id: "pisos", label: "Pisos y revestimientos", keywords: ["piso", "ceramica", "porcelana", "madera", "laminado", "terrazo", "colocar piso"] },
      { id: "impermeabilizacion", label: "Impermeabilización", keywords: ["impermeabilizar", "humedad", "filtraciones", "goteras", "sello", "azotea"] },
      { id: "fumigacion", label: "Fumigación", keywords: ["plagas", "cucarachas", "termitas", "mosquitos", "chinches", "hormigas", "ratones"] },
      { id: "cerrajeria", label: "Cerrajería", keywords: ["cerrajero", "llaves", "candados", "cerradura", "chapas", "seguridad de puertas"] },
      { id: "aire_acondicionado", label: "Aire acondicionado", keywords: ["AC", "climatizacion", "frio", "ventilacion", "HVAC", "refrigeracion"] },
      { id: "calentadores", label: "Calentadores de agua", keywords: ["calentador de agua", "ducha electrica", "calefon", "termotanque"] },
      { id: "bombas_agua", label: "Bombas de agua", keywords: ["bomba de agua", "bomba sumergible", "tanque de agua", "presion de agua", "hidroneumatico"] },
      { id: "ventanas_puertas", label: "Ventanas y puertas", keywords: ["vidrio", "aluminio", "puertas corredizas", "ventaneria", "instalacion de ventanas"] },
      { id: "vidrieria", label: "Vidriería", keywords: ["vidriero", "vidrios", "cristal", "espejos", "ventanas de vidrio", "puertas de vidrio"] },
      { id: "soldadura", label: "Soldadura", keywords: ["soldador", "hierro", "metal", "estructuras metalicas", "herreria", "rejas"] },
      { id: "herreria", label: "Herrería", keywords: ["herrero", "rejas", "portones", "barandas", "estructuras metalicas", "hierro"] },
      { id: "gypsum", label: "Gypsum / Drywall", keywords: ["cielo raso", "tabiques", "divisiones", "drywall", "tablaroca", "plycem"] },
      { id: "servicio_gas", label: "Servicio de gas", keywords: ["gas", "cilindro de gas", "tanque de gas", "recarga de gas", "instalacion de gas", "tropigas", "zeta gas", "gas licuado"] },
      { id: "reparacion_electrodomesticos", label: "Reparación de electrodomésticos", keywords: ["electrodomesticos", "refrigeradora", "refri", "lavadora", "secadora", "microondas", "cocina electrica", "lavaplatos", "reparacion de linea blanca"] },
      { id: "ingenieria_civil", label: "Ingeniería civil", keywords: ["ingeniero", "estructuras", "planos", "calculo estructural", "obra civil"] },
      { id: "ingenieria_electrica", label: "Ingeniería eléctrica", keywords: ["ingeniero electrico", "planos electricos", "diseno electrico", "cargas electricas", "sistema electrico"] },
      { id: "ingenieria_mecanica", label: "Ingeniería mecánica", keywords: ["ingeniero mecanico", "sistemas mecanicos", "ventilacion", "equipos mecanicos", "mantenimiento industrial"] },
      { id: "arquitectura", label: "Arquitectura", keywords: ["arquitecto", "diseno arquitectonico", "planos", "renders", "diseño de casa"] },
      { id: "topografia", label: "Topografía", keywords: ["topografo", "levantamiento topografico", "catastro", "mediciones", "plano catastral"] },
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
      { id: "lavado_muebles", label: "Lavado de muebles", keywords: ["muebles", "sillones", "sofas", "colchones", "tapiceria de muebles", "limpieza de muebles"] },
      { id: "limpieza_post_construccion", label: "Limpieza post-construcción", keywords: ["obra", "escombros", "construccion", "polvo de obra"] },
      { id: "lavado_vehiculos", label: "Lavado de vehículos", keywords: ["carro", "auto", "lavado", "lavado express", "lavado de carro"] },
    ],
  },
  {
    id: "tecnologia",
    label: "Tecnología",
    emoji: "💻",
    items: [
      { id: "tecnologia", label: "TI", keywords: ["tecnologia", "TI", "informatica", "sistemas", "servicios tecnologicos", "IT"] },
      { id: "reparacion_computadoras", label: "Reparación de computadoras", keywords: ["computadora", "laptop", "PC", "Mac", "tecnico en computo", "notebook"] },
      { id: "redes_internet", label: "Redes e internet", keywords: ["WiFi", "router", "red", "cableado estructurado", "internet", "fibra"] },
      { id: "camaras_seguridad", label: "Cámaras de seguridad", keywords: ["CCTV", "vigilancia", "camaras", "circuito cerrado", "DVR", "NVR"] },
      { id: "domotica", label: "Domótica / Smart home", keywords: ["automatizacion del hogar", "smart home", "IoT", "casa inteligente"] },
      { id: "desarrollo_web", label: "Desarrollo web", keywords: ["programador web", "pagina web", "sitio web", "website", "aplicacion web", "web app", "desarrollador", "desarrollador de software", "diseñador web", "WordPress", "React", "programacion"] },
      { id: "diseno_grafico", label: "Diseño gráfico", keywords: ["disenador", "logos", "branding", "publicidad", "arte", "identidad visual", "flyers"] },
      { id: "diseno_apps", label: "Desarrollo de apps móviles", keywords: ["aplicacion movil", "app", "apps", "iOS", "Android", "programador", "desarrollo movil", "diseño de apps", "app movil"] },
      { id: "soporte_tecnico", label: "Soporte técnico", keywords: ["IT", "soporte", "tecnico", "help desk", "mantenimiento de equipo", "asistencia tecnica"] },
      { id: "ciberseguridad", label: "Ciberseguridad", keywords: ["seguridad informatica", "seguridad digital", "auditoria de seguridad", "hacking etico", "proteccion de datos"] },
      { id: "consultoria_ti", label: "Consultoría TI", keywords: ["consultor de TI", "consultoria tecnologia", "sistemas", "infraestructura TI", "asesoria tecnologica"] },
      { id: "reparacion_celulares", label: "Reparación de celulares", keywords: ["celular", "telefono", "smartphone", "pantalla quebrada", "bateria", "iPhone", "Android"] },
      { id: "reparacion_impresoras", label: "Reparación de impresoras", keywords: ["impresora", "multifuncional", "toner", "cartucho", "atasco de papel", "mantenimiento impresora"] },
      { id: "impresion_3d", label: "Impresión 3D", keywords: ["impresion tridimensional", "FDM", "prototipo", "modelado 3D"] },
      { id: "audio_video", label: "Audio y video profesional", keywords: ["sonido", "video", "instalacion AV", "pantallas", "proyectores", "sala de cine"] },
    ],
  },
  {
    id: "profesional",
    label: "Servicios empresariales",
    emoji: "💼",
    items: [
      { id: "contabilidad", label: "Contabilidad y finanzas", keywords: ["contador", "CPA", "finanzas", "declaracion de renta", "tributacion", "libros contables", "impuestos", "hacienda"] },
      { id: "legal", label: "Abogados y servicios legales", keywords: ["abogado", "notario", "asesor legal", "juridico", "contratos", "derecho", "bufete", "tramites"] },
      { id: "notaria", label: "Notaría", keywords: ["notario publico", "notaria publica", "escrituras", "autenticaciones", "traspasos", "protocolizacion"] },
      { id: "auditoria", label: "Auditoría", keywords: ["auditor", "auditoria financiera", "revision contable", "control interno", "cumplimiento"] },
      { id: "asesoria_financiera", label: "Asesoría financiera", keywords: ["asesor financiero", "finanzas personales", "inversiones", "presupuesto", "plan financiero"] },
      { id: "corredor_seguros", label: "Corredor de seguros", keywords: ["seguros", "polizas", "broker de seguros", "asesor de seguros", "seguro medico", "seguro auto"] },
      { id: "asesoria_tributaria", label: "Asesoría tributaria", keywords: ["impuestos", "tributacion", "hacienda", "IVA", "renta", "declaraciones"] },
      { id: "consultoria", label: "Consultoría empresarial", keywords: ["consultor", "asesor de negocios", "estrategia empresarial", "gestion", "plan de negocios"] },
      { id: "traduccion", label: "Traducción e interpretación", keywords: ["traductor", "interprete", "traduccion", "idiomas", "english", "frances"] },
      { id: "recursos_humanos", label: "Recursos humanos", keywords: ["reclutamiento", "seleccion de personal", "RRHH", "HR", "planilla", "nomina"] },
      { id: "marketing_digital", label: "Marketing digital", keywords: ["community manager", "redes sociales", "publicidad digital", "SEO", "SEM", "Google Ads", "Instagram"] },
      { id: "diseno", label: "Diseño y arte", keywords: ["diseno", "diseño", "arte", "artista", "ilustracion", "ilustración", "creativo", "creativa", "visual", "logo", "logos", "branding", "diseño / arte", "diseno y arte"] },
      { id: "publicidad", label: "Publicidad", keywords: ["publicista", "campañas publicitarias", "anuncios", "medios", "estrategia publicitaria"] },
      { id: "redaccion_contenido", label: "Redacción de contenido", keywords: ["redactor", "copywriter", "contenido web", "blogs", "textos", "articulos"] },
      { id: "fotografia", label: "Fotografía profesional", keywords: ["fotografo", "fotografia", "retrato", "foto profesional", "sesion de fotos"] },
      { id: "produccion_video", label: "Producción de video", keywords: ["videografo", "video", "edicion de video", "filmacion", "YouTube", "reels"] },
      { id: "capacitacion_empresarial", label: "Capacitación empresarial", keywords: ["capacitador", "talleres empresariales", "formacion empresarial", "entrenamiento corporativo"] },
      { id: "gestoria_tramites", label: "Gestoría de trámites", keywords: ["gestor", "tramites", "permisos", "municipalidad", "hacienda", "CCSS", "documentos"] },
      { id: "bienes_raices", label: "Bienes raíces", keywords: ["agente inmobiliario", "corredor de propiedades", "compra y venta", "arrendamiento", "alquiler", "propiedades"] },
      { id: "avaluos", label: "Avalúos", keywords: ["avaluador", "valoracion", "tasacion", "avaluo de propiedad", "peritaje"] },
      { id: "consultoria_ambiental", label: "Consultoría ambiental", keywords: ["consultor ambiental", "SETENA", "impacto ambiental", "permisos ambientales", "sostenibilidad"] },
      { id: "coaching", label: "Coaching", keywords: ["coach", "coaching profesional", "coaching personal", "mentoria", "desarrollo personal"] },
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
      { id: "psicologia", label: "Psicología", keywords: ["psicologo", "terapeuta", "salud mental", "terapia", "counseling", "ansiedad", "depresion", "bienestar emocional"] },
      { id: "psiquiatria", label: "Psiquiatría", keywords: ["psiquiatra", "salud mental", "medicacion", "depresion", "ansiedad", "consulta psiquiatrica"] },
      { id: "fisioterapia", label: "Fisioterapia", keywords: ["fisioterapeuta", "rehabilitacion", "terapia fisica", "kinesiologia", "dolor de espalda"] },
      { id: "odontologia", label: "Odontología", keywords: ["dentista", "odontologo", "dientes", "muela", "limpieza dental", "ortodoncia", "endodoncia", "caries"] },
      { id: "ortodoncia", label: "Ortodoncia", keywords: ["ortodoncista", "frenillos", "brackets", "alineadores", "tratamiento dental"] },
      { id: "pediatria", label: "Pediatría", keywords: ["pediatra", "medico de ninos", "salud infantil", "control de nino sano", "vacunas", "bebe"] },
      { id: "optometria", label: "Optometría", keywords: ["optometrista", "examen de la vista", "anteojos", "lentes", "graduacion de lentes", "vision"] },
      { id: "optica_lentes", label: "Óptica y lentes", keywords: ["optica", "lentes", "anteojos", "aros", "lentes de contacto", "graduacion"] },
      { id: "enfermeria", label: "Enfermería", keywords: ["enfermero", "enfermera", "cuidados a domicilio", "inyecciones", "curaciones", "sondas"] },
      { id: "medicina_domicilio", label: "Medicina general", keywords: ["doctor", "medico", "medico general", "consulta medica", "medico a domicilio", "visita medica", "medicina general"] },
      { id: "medico_especialista", label: "Médico especialista", keywords: ["especialista medico", "cardiologo", "dermatologo", "ginecologo", "internista", "traumatologo", "especialidad medica"] },
      { id: "laboratorio_clinico", label: "Laboratorio clínico", keywords: ["laboratorio", "examenes de sangre", "analisis clinicos", "pruebas medicas", "toma de muestras"] },
      { id: "ambulancias_privadas", label: "Ambulancias privadas", keywords: ["ambulancia", "traslado medico", "emergencia privada", "transporte medico", "paramedico"] },
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
      { id: "belleza", label: "Servicios de belleza", keywords: ["belleza", "estetica", "salon de belleza", "cuidado personal"] },
      { id: "peluqueria", label: "Peluquería y barbería", keywords: ["barbero", "estilista", "corte de pelo", "cabello", "coloracion", "mechas", "peluquero"] },
      { id: "maquillaje", label: "Maquillaje", keywords: ["maquillista", "makeup", "maquillaje artistico", "novia", "maquillaje de noche"] },
      { id: "unhas", label: "Uñas / Manicure", keywords: ["nail tech", "manicure", "pedicure", "unas acrilicas", "gel", "nail art", "semipermanente"] },
      { id: "pestanas", label: "Pestañas", keywords: ["extensiones de pestanas", "lifting de pestanas", "lash", "laminated"] },
      { id: "depilacion", label: "Depilación", keywords: ["depiladora", "cera", "laser", "hilo", "sugaring", "depilacion definitiva"] },
      { id: "estetica_facial", label: "Estética facial", keywords: ["esteticista", "limpieza facial", "faciales", "tratamientos de piel", "dermapen", "hidrafacial"] },
      { id: "spa", label: "Spa", keywords: ["spa", "relajacion", "tratamientos corporales", "faciales", "bienestar", "day spa"] },
      { id: "bronceado", label: "Bronceado", keywords: ["autobronceado", "spray tan", "bronceado artificial", "cama de bronceado"] },
    ],
  },
  {
    id: "moda_y_cuidado_personal",
    label: "Moda y cuidado personal",
    emoji: "🧵",
    items: [
      { id: "costura_y_arreglos_de_ropa", label: "Costura y arreglos de ropa", keywords: ["costurera", "sastreria", "sastre", "arreglos de ropa", "ruedos", "ajustes de ropa"] },
      { id: "lavanderia", label: "Lavandería", keywords: ["lavado de ropa", "planchado", "lavaseco", "dry cleaning", "ropa", "edredones"] },
      { id: "zapateria", label: "Zapatería", keywords: ["zapatero", "reparacion de zapatos", "suelas", "tacones", "calzado"] },
      { id: "relojeria", label: "Relojería", keywords: ["relojero", "reparacion de relojes", "bateria de reloj", "relojes"] },
      { id: "joyeria", label: "Joyería", keywords: ["joyero", "reparacion de joyas", "anillos", "cadenas", "oro", "plata"] },
    ],
  },
  {
    id: "educacion",
    label: "Educación y clases",
    emoji: "📚",
    items: [
      { id: "tutorias", label: "Tutorías académicas", keywords: ["tutor", "clases particulares", "apoyo escolar", "reforzamiento", "clases de apoyo", "profe particular"] },
      { id: "idiomas", label: "Idiomas", keywords: ["ingles", "espanol", "frances", "mandarin", "profesor de idiomas", "clases de ingles", "English teacher"] },
      { id: "musica", label: "Clases de música", keywords: ["profesor de musica", "guitarra", "piano", "canto", "bateria", "violín", "clases de musica"] },
      { id: "matematicas", label: "Matemáticas y ciencias", keywords: ["matematicas", "fisica", "quimica", "ciencias", "profesor de mate", "algebra", "calculo"] },
      { id: "preparacion_universitaria", label: "Preparación universitaria", keywords: ["preparacion para la UCR", "TEC", "examen de admision", "PICCTT", "admision universitaria"] },
      { id: "clases_manejo", label: "Clases de manejo", keywords: ["conduccion", "licencia", "manejar", "autoescuela", "clase de conducir"] },
      { id: "clases_baile", label: "Clases de baile", keywords: ["baile", "salsa", "bachata", "danza", "coreografia", "academia de baile"] },
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
      { id: "transporte_privado", label: "Transporte privado", keywords: ["taxi", "chofer", "transporte ejecutivo", "traslado privado", "viajes privados"] },
      { id: "alquiler_vehiculos", label: "Alquiler de vehículos", keywords: ["rent a car", "alquiler de carro", "alquiler de autos", "vehiculos", "carro de alquiler"] },
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
      { id: "organizacion_eventos", label: "Organización de eventos", keywords: ["organizador de eventos", "event planner", "coordinacion de eventos", "bodas", "fiestas"] },
      { id: "dj_sonido", label: "DJ y sonido", keywords: ["DJ", "musica para eventos", "sonido", "disc jockey", "equipo de sonido"] },
      { id: "chef", label: "Chef privado y cocina", keywords: ["chef privado", "cocina para eventos", "comida por encargo", "cocinero", "gastronomia", "meal prep", "cena privada", "comida a domicilio"] },
      { id: "catering", label: "Catering y banquetes", keywords: ["comida para eventos", "banquetes", "servicio de alimentacion", "lunch", "buffet"] },
      { id: "decoracion", label: "Decoración de eventos", keywords: ["decorador de eventos", "flores", "globos", "ambientacion", "bodas", "decoracion"] },
      { id: "alquiler_mobiliario", label: "Alquiler de mobiliario", keywords: ["mesas", "sillas", "manteleria", "mobiliario para eventos", "alquiler de sillas"] },
      { id: "maestro_ceremonias", label: "Maestro de ceremonias", keywords: ["animador", "presentador", "MC", "moderador", "protocolo"] },
      { id: "floristeria", label: "Floristería", keywords: ["flores", "arreglos florales", "ramos", "decoracion floral", "florista"] },
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
      { id: "monitoreo_alarmas", label: "Monitoreo de alarmas", keywords: ["monitoreo", "central de monitoreo", "respuesta de alarmas", "seguridad electronica"] },
      { id: "cercas_electricas", label: "Cercas eléctricas", keywords: ["cerca electrica", "cercado electrico", "seguridad perimetral", "instalacion de cerca"] },
      { id: "cctv", label: "Circuito cerrado CCTV", keywords: ["camaras", "circuito cerrado", "vigilancia", "DVR", "monitoreo"] },
      { id: "control_acceso", label: "Control de acceso", keywords: ["control de acceso", "tarjetas de acceso", "biometria", "lector de huella", "porton"] },
      { id: "investigacion_privada", label: "Investigación privada", keywords: ["investigador privado", "detective privado", "investigacion", "seguimiento", "verificacion"] },
    ],
  },
  {
    id: "automotriz",
    label: "Vehículos y movilidad",
    emoji: "🚗",
    items: [
      { id: "mecanica", label: "Mecánica automotriz", keywords: ["mecanico", "mecanico automotriz", "taller", "motor", "frenos", "transmision", "aceite", "servicio de auto"] },
      { id: "mecanica_bicicletas", label: "Mecánica de bicicletas", keywords: ["bicicleta", "bicicletas", "bici", "bicis", "cleta", "cletas", "mecanico de bicicletas", "reparacion de bicicletas", "taller de bicicletas", "frenos de bicicleta", "cadena de bicicleta", "llantas de bicicleta", "mountain bike", "ciclismo", "bicycle", "bike", "bike repair", "bicycle repair", "bicycle mechanic", "bike mechanic"] },
      { id: "hojalateria", label: "Hojalatería y pintura de carros", keywords: ["hojalatero", "chapisteria", "enderezado y pintura", "latoneria", "carroceria", "abolladuras", "pintura de carro"] },
      { id: "electricidad_automotriz", label: "Electricidad automotriz", keywords: ["electrico automotriz", "bateria", "alternador", "luces del carro", "alarmas para carro"] },
      { id: "tapiceria", label: "Tapicería", keywords: ["tapicero", "asientos", "tela de carro", "cuero", "tapizado"] },
      { id: "detailing", label: "Detailing de autos", keywords: ["detailing", "pulidura", "encerado", "limpieza profunda de auto", "pulir carro"] },
      { id: "polarizado", label: "Polarizado", keywords: ["polarizado de carros", "polarizar", "lamina solar", "tinte de ventanas"] },
      { id: "cambio_llantas", label: "Cambio de llantas", keywords: ["llantas", "neumaticos", "cambio de caucho", "vulcanizadora", "rin", "goma"] },
      { id: "grua", label: "Servicio de grúa", keywords: ["grua", "remolque", "asistencia en carretera", "traslado de vehiculo", "carro varado"] },
    ],
  },
  {
    id: "turismo",
    label: "Turismo",
    emoji: "🧭",
    items: [
      { id: "agencia_viajes", label: "Agencia de viajes", keywords: ["viajes", "paquetes turisticos", "boletos", "vacaciones", "tour"] },
      { id: "guia_turistico", label: "Guía turístico", keywords: ["guia turistico", "guia local", "tour guide", "excursiones", "recorridos"] },
      { id: "operador_turistico", label: "Operador turístico", keywords: ["operador de tours", "tours", "excursiones", "turismo aventura", "paquetes"] },
      { id: "alquiler_vacacional", label: "Alquiler vacacional", keywords: ["casa de vacaciones", "cabina", "villa", "hospedaje vacacional", "airbnb"] },
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

/* ─── Admin-approved CUSTOM categories (dynamic overlay) ───────────────────────
   The fixed catalog above is the base. When an admin approves a user's
   "¿No ves tu categoría?" suggestion it becomes a real, selectable/searchable
   category WITHOUT a code deploy: it's stored as an approved `category_suggestions`
   row and loaded at runtime into this registry (client-side, via
   `useCustomCategories`). `searchCategories` + `getCategoryLabel` consult it so an
   approved custom category behaves like any built-in one. Stays empty on the
   server (no fetch) — there `getCategoryLabel` falls back to a clean slug label. */
export const CUSTOM_GROUP_ID = "otras";
let CUSTOM_CATEGORIES: (CategoryItem & { groupId: string; groupLabel: string; labelEn?: string })[] = [];
let CATEGORY_CATALOG_OVERRIDES = new Map<string, { label?: string; labelEn?: string; groupId?: string; keywords?: string[]; isHidden?: boolean }>();
let CATEGORY_FEATURE_OVERRIDES = new Map<string, { esSalud?: boolean; supportsVideoconsulta?: boolean; isHidden?: boolean }>();
let CUSTOM_CATEGORY_GROUPS: { id: string; label: string; labelEn?: string; iconKey?: string; sortOrder?: number; isHidden?: boolean }[] = [];
const customListeners = new Set<() => void>();

export function setCategoryFeatureOverrides(
  list: { id: string; esSalud?: boolean; supportsVideoconsulta?: boolean; isHidden?: boolean }[]
): void {
  CATEGORY_FEATURE_OVERRIDES = new Map(
    list
      .filter((c) => c && c.id)
      .map((c) => [c.id, { esSalud: c.esSalud, supportsVideoconsulta: c.supportsVideoconsulta, isHidden: c.isHidden }])
  );
  customListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function setCustomCategories(
  list: { id: string; label: string; labelEn?: string; groupId?: string; keywords?: string[]; esSalud?: boolean; supportsVideoconsulta?: boolean; isHidden?: boolean }[],
  groups: { id: string; label: string; labelEn?: string; iconKey?: string; sortOrder?: number; isHidden?: boolean }[] = []
): void {
  const normalizedGroups = new Map<string, { id: string; label: string; labelEn?: string; iconKey?: string; sortOrder?: number; isHidden?: boolean }>();
  for (const group of groups) {
    if (!group?.id || !group.label || group.isHidden) continue;
    const id = normalizeCategoryGroupId(group.id, group.label);
    normalizedGroups.set(id, {
      ...group,
      id,
      label: isOtherCategoryGroup(id, group.label) ? "Otras categorías" : group.label,
      labelEn: isOtherCategoryGroup(id, group.label) ? "Other categories" : group.labelEn,
      sortOrder: isOtherCategoryGroup(id, group.label) ? Number.MAX_SAFE_INTEGER : group.sortOrder,
    });
  }
  CUSTOM_CATEGORY_GROUPS = Array.from(normalizedGroups.values());
  const fixedIds = new Set(ALL_CATEGORIES.map((category) => category.id));
  CATEGORY_CATALOG_OVERRIDES = new Map(
    list
      .filter((c) => c && c.id && !c.isHidden && (c.label || c.labelEn || c.groupId))
      .map((c) => [c.id, {
        label: c.label,
        labelEn: c.labelEn,
        groupId: c.groupId ? normalizeCategoryGroupId(c.groupId) : undefined,
        keywords: c.keywords,
        isHidden: c.isHidden,
      }])
  );
  CUSTOM_CATEGORIES = list
    .filter((c) => c && c.id && c.label && c.groupId && !c.isHidden && !fixedIds.has(c.id))
    .map((c) => {
      const groupId = normalizeCategoryGroupId(c.groupId);
      return {
        id: c.id,
        label: c.label,
        labelEn: c.labelEn,
        keywords: c.keywords ?? [],
        groupId,
        groupLabel: getCategoryGroupLabel(groupId),
      };
    });
  const mergedFeatureOverrides = new Map(CATEGORY_FEATURE_OVERRIDES);
  for (const c of list) {
    if (!c?.id) continue;
    mergedFeatureOverrides.set(c.id, {
      ...mergedFeatureOverrides.get(c.id),
      esSalud: c.esSalud,
      supportsVideoconsulta: c.supportsVideoconsulta,
      isHidden: c.isHidden,
    });
  }
  CATEGORY_FEATURE_OVERRIDES = mergedFeatureOverrides;
  customListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function getCustomCategories(): (CategoryItem & { groupId: string; groupLabel: string; labelEn?: string })[] {
  return CUSTOM_CATEGORIES;
}

export function isOtherCategoryGroup(groupId?: string | null, label?: string | null): boolean {
  if (groupId === CUSTOM_GROUP_ID || groupId === "otras_categorias") return true;
  const normalized = normalizeText(`${groupId ?? ""} ${label ?? ""}`).replace(/[^a-z]/g, "");
  return normalized === "otrascategorias" || normalized === "othercategories";
}

export function normalizeCategoryGroupId(groupId?: string | null, label?: string | null): string {
  const id = (groupId || "").trim();
  return isOtherCategoryGroup(id, label) ? CUSTOM_GROUP_ID : id;
}

export function sortCategoryGroups<T extends { id: string; label?: string; sortOrder?: number }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const aOther = isOtherCategoryGroup(a.id, a.label);
    const bOther = isOtherCategoryGroup(b.id, b.label);
    if (aOther !== bOther) return aOther ? 1 : -1;
    return (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || (a.label ?? "").localeCompare(b.label ?? "");
  });
}

export function getAllCategoryGroups(): { id: string; label: string; labelEn?: string; iconKey?: string; sortOrder?: number }[] {
  const fixed = CATEGORY_GROUPS.map((group, index) => ({
    id: group.id,
    label: group.label,
    labelEn: CATEGORY_GROUP_LABELS_EN[group.id],
    iconKey: CATEGORY_GROUP_ICON_KEYS[group.id],
    sortOrder: (index + 1) * 10,
  }));
  const fixedIds = new Set(fixed.map((group) => group.id));
  const custom = CUSTOM_CATEGORY_GROUPS.filter((group) => !fixedIds.has(group.id));
  const knownIds = new Set([...fixedIds, ...custom.map((group) => group.id)]);
  const missingGroups = Array.from(
    new Set([
      ...CUSTOM_CATEGORIES.map((category) => category.groupId),
      ...Array.from(CATEGORY_CATALOG_OVERRIDES.values()).map((override) => override.groupId).filter(Boolean),
    ])
  )
    .map((id) => normalizeCategoryGroupId(id))
    .filter((id): id is string => typeof id === "string" && !!id && !knownIds.has(id))
    .map((id) => ({
      id,
      label: getCategoryGroupLabel(id),
      labelEn: getCategoryGroupLabel(id, "en"),
      sortOrder: isOtherCategoryGroup(id) ? Number.MAX_SAFE_INTEGER : 100,
    }));
  return sortCategoryGroups([...fixed, ...custom, ...missingGroups]);
}

/** Subscribe to custom-category registry changes (used by the client hook). */
export function subscribeCustomCategories(fn: () => void): () => void {
  customListeners.add(fn);
  return () => { customListeners.delete(fn); };
}

/** The full catalog = fixed taxonomy + admin-approved custom categories. */
export function getAllCategories(): (CategoryItem & { groupId: string; groupLabel: string })[] {
  const fixed = ALL_CATEGORIES
    .filter((category) => CATEGORY_FEATURE_OVERRIDES.get(category.id)?.isHidden !== true && CATEGORY_CATALOG_OVERRIDES.get(category.id)?.isHidden !== true)
    .map((category) => {
      const override = CATEGORY_CATALOG_OVERRIDES.get(category.id);
      const groupId = override?.groupId || category.groupId;
      return {
        ...category,
        label: override?.label || category.label,
        keywords: override?.keywords ?? category.keywords,
        groupId,
        groupLabel: getCategoryGroupLabel(groupId),
      };
    });
  return CUSTOM_CATEGORIES.length ? [...fixed, ...CUSTOM_CATEGORIES] : fixed;
}

/* ─── Normalize text for accent-insensitive comparison ─── */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/* ─── Canonical category ID from a name ───
   The ONE way to turn a category name into an id, so generated ids are consistent
   everywhere (e.g. the "¿No ves tu categoría?" suggestion → approval flow). It's
   the name lowercased with words joined by underscores, accents stripped and any
   other char dropped — e.g. "Plomería" → "plomeria", "Amor bueno" → "amor_bueno".
   NO prefix (the old `sg_` was a leftover "suggestion" tag). Falls back to
   "categoria" if the name has no usable characters. */
const ENGLISH_SERVICE_TERMS: Record<string, string> = {
  abogado: "Lawyer",
  abogados: "Lawyers",
  acupuntura: "Acupuncture",
  agencia: "Agency",
  aire: "Air",
  alquiler: "Rental",
  alarmas: "Alarms",
  ambiental: "Environmental",
  ambulancias: "Ambulances",
  arquitectura: "Architecture",
  asesoria: "Advisory",
  auditoria: "Auditing",
  automotriz: "Auto",
  avaluos: "Appraisals",
  baile: "Dance",
  belleza: "Beauty",
  bombas: "Pumps",
  calentadores: "Water heaters",
  camaras: "Cameras",
  cardiologia: "Cardiology",
  carpinteria: "Carpentry",
  catering: "Catering",
  clases: "Classes",
  cocina: "Cooking",
  computadoras: "Computers",
  construccion: "Construction",
  consultoria: "Consulting",
  contabilidad: "Accounting",
  corredor: "Broker",
  costura: "Sewing",
  cuidado: "Care",
  decoracion: "Decoration",
  depilacion: "Hair removal",
  desarrollo: "Development",
  diseno: "Design",
  electrica: "Electrical",
  electricas: "Electrical",
  electricidad: "Electrical",
  enfermeria: "Nursing",
  eventos: "Events",
  financiera: "Financial",
  fisioterapia: "Physical therapy",
  floristeria: "Florist",
  fotografia: "Photography",
  fumigacion: "Pest control",
  gas: "Gas",
  gestoria: "Errand services",
  grafico: "Graphic",
  grua: "Tow truck",
  hogar: "Home",
  impermeabilizacion: "Waterproofing",
  investigacion: "Investigation",
  infantil: "Childcare",
  ingenieria: "Engineering",
  jardin: "Garden",
  jardineria: "Gardening",
  joyeria: "Jewelry",
  lavanderia: "Laundry",
  legal: "Legal",
  limpieza: "Cleaning",
  maquillaje: "Makeup",
  mecanica: "Mechanical",
  masajes: "Massage",
  medicina: "Medicine",
  medico: "Medical",
  mensajeria: "Courier",
  mobiliario: "Furniture",
  monitoreo: "Monitoring",
  movil: "Mobile",
  notaria: "Notary",
  nutricion: "Nutrition",
  odontologia: "Dentistry",
  optica: "Optical",
  ortodoncia: "Orthodontics",
  pediatria: "Pediatrics",
  peluqueria: "Hair salon",
  pintura: "Painting",
  piscinas: "Pools",
  plomeria: "Plumbing",
  podologia: "Podiatry",
  psicologia: "Psychology",
  reparacion: "Repair",
  seguridad: "Security",
  servicio: "Service",
  seguros: "Insurance",
  soporte: "Support",
  spa: "Spa",
  tecnico: "Tech",
  terapia: "Therapy",
  tributaria: "Tax",
  transporte: "Transport",
  turismo: "Tourism",
  veterinaria: "Veterinary",
  viajes: "Travel",
  video: "Video",
  web: "Web",
};

const ENGLISH_SERVICE_PHRASES: Record<string, string> = {
  "aire acondicionado": "Air conditioning",
  "alarmas de seguridad": "Security alarms",
  "alquiler de vehiculos": "Vehicle rental",
  "alquiler vacacional": "Vacation rental",
  "ambulancias privadas": "Private ambulances",
  "asesoria financiera": "Financial advisory",
  "asesoria tributaria": "Tax advisory",
  "bombas de agua": "Water pumps",
  "camaras de seguridad": "Security cameras",
  "capacitacion empresarial": "Business training",
  "cercas electricas": "Electric fences",
  "belleza y estetica": "Beauty & aesthetics",
  "servicios de belleza": "Beauty services",
  "clases de cocina": "Cooking classes",
  "clases de manejo": "Driving lessons",
  "clases de baile": "Dance classes",
  "clases de musica": "Music lessons",
  "consultoria empresarial": "Business consulting",
  "control de acceso": "Access control",
  "control de plagas": "Pest control",
  "corredor de seguros": "Insurance broker",
  "costura y arreglos de ropa": "Sewing and clothing alterations",
  "cuidado de adultos": "Adult care",
  "cuidado de adultos mayores": "Senior care",
  "cuidado infantil": "Childcare",
  "desarrollo de apps moviles": "Mobile app development",
  "desarrollo web": "Web development",
  "diseno de apps": "App design",
  "diseno grafico": "Graphic design",
  "electricidad automotriz": "Auto electrical",
  "guia turistico": "Tour guide",
  "fotografia de eventos": "Event photography",
  "ingenieria electrica": "Electrical engineering",
  "ingenieria mecanica": "Mechanical engineering",
  "investigacion privada": "Private investigation",
  "laboratorio clinico": "Clinical laboratory",
  "limpieza de alfombras": "Carpet cleaning",
  "limpieza de casas": "House cleaning",
  "lavado de muebles": "Upholstery cleaning",
  "limpieza de oficinas": "Office cleaning",
  "limpieza de piscinas": "Pool cleaning",
  "limpieza del hogar": "Home cleaning",
  "limpieza post construccion": "Post-construction cleaning",
  "maestro de ceremonias": "Master of ceremonies",
  "maestro de obras": "Construction foreman",
  "mecanica de bicicletas": "Bicycle repair",
  "mecanica automotriz": "Auto mechanics",
  "medicina general": "General medicine",
  "medico especialista": "Medical specialist",
  "mensajeria express": "Express courier",
  "monitoreo de alarmas": "Alarm monitoring",
  "optica y lentes": "Optical store and lenses",
  "organizacion de eventos": "Event planning",
  "preparacion universitaria": "College prep",
  "produccion de video": "Video production",
  "redes e internet": "Networking and internet",
  "redes internet": "Networking and internet",
  "reparacion de celulares": "Phone repair",
  "reparacion de computadoras": "Computer repair",
  "reparacion de impresoras": "Printer repair",
  "redaccion de contenido": "Content writing",
  "servicio tecnico": "Technical support",
  "servicio de grua": "Tow truck service",
  "soporte tecnico": "Tech support",
  "tecnologia ti": "IT",
  "transporte privado": "Private transportation",
  "transporte de mascotas": "Pet transport",
  "venta de computadoras": "Computer sales",
  "venta de componentes": "Computer parts sales",
};

const ENGLISH_CONNECTORS: Record<string, string> = {
  con: "with",
  contra: "against",
  de: "of",
  del: "of",
  e: "and",
  en: "in",
  para: "for",
  por: "by",
  y: "and",
};

export function autoEnglishCategoryLabel(label: string): string {
  const normalized = normalizeText(label)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const phrase = ENGLISH_SERVICE_PHRASES[normalized];
  if (phrase) return phrase;

  const translated = label
    .trim()
    .split(/\s+/)
    .map((word) => {
      const clean = normalizeText(word).replace(/[^a-z0-9]/g, "");
      const connector = ENGLISH_CONNECTORS[clean];
      if (connector) return connector;
      const match = ENGLISH_SERVICE_TERMS[clean];
      if (match) return match;
      const raw = word.replace(/[^\p{L}\p{N}]/gu, "");
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "";
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return translated || label;
}

export function slugifyCategory(name: string): string {
  const slug = (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents/diacritics
    .replace(/[^a-z0-9]+/g, "_")      // any run of non-alphanumerics → one underscore
    .replace(/^_+|_+$/g, "")          // trim leading/trailing underscores
    .slice(0, 40)
    .replace(/_+$/g, "");             // re-trim if slice cut mid-underscore
  return slug || "categoria";
}

export function searchTextScore(term: string, query: string, exact: number, starts: number, contains: number): number {
  const q = normalizeText(query.trim());
  if (!q) return 0;
  const normalized = normalizeText(term);
  if (!normalized) return 0;
  if (normalized === q) return exact;
  if (normalized.startsWith(q)) return starts;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.some((token) => token === q || token.startsWith(q))) return starts;

  const slashParts = normalized.split(/\s*[/-]\s*/).filter(Boolean);
  if (slashParts.some((part) => part === q || part.startsWith(q))) return starts;

  if (q.includes(" ") && normalized.includes(q)) return contains;
  if (normalized.includes(` ${q} `) || normalized.endsWith(` ${q}`)) return contains;

  return 0;
}

/* ─── Fuzzy search across all categories (fixed + custom) by label + keywords ─── */
export function categorySearchScore(
  item: CategoryItem & { groupId: string; groupLabel: string },
  query: string,
  locale?: string,
): number {
  const q = normalizeText(query.trim());
  if (!q) return 0;
  const serviceLabels = [getCategoryLabel(item.id, locale), item.label].filter(Boolean);
  const groupLabels = [item.groupLabel, getCategoryGroupLabel(item.groupId), getCategoryGroupLabel(item.groupId, locale)].filter(Boolean);
  const serviceScore = Math.max(0, ...serviceLabels.map((term) => searchTextScore(term, q, 120, 90, 55)));
  const keywordScore = Math.max(0, ...item.keywords.map((term) => searchTextScore(term, q, 110, 45, 28)));
  const groupScore = Math.max(0, ...groupLabels.map((term) => searchTextScore(term, q, 38, 28, 18)));
  return Math.max(serviceScore, keywordScore, groupScore);
}

export function searchCategories(query: string, locale?: string): (CategoryItem & { groupId: string; groupLabel: string })[] {
  const pool = getAllCategories();
  if (!query.trim()) return pool;
  return pool
    .map((item, index) => ({ item, index, score: categorySearchScore(item, query, locale) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((match) => match.item);
}

const NATURAL_QUERY_ALIASES: Record<string, string[]> = {
  limpieza: ["limpiar mi casa", "limpiar casa", "limpiar el hogar", "limpieza de mi casa", "asear mi casa", "servicio domestico", "clean my house", "clean my home", "house cleaned", "home cleaned"],
  limpieza_oficinas: ["limpiar oficina", "limpieza de oficina", "aseo de oficina", "limpiar local"],
  plomeria: ["arreglar fuga", "tengo una fuga", "arreglar tubo", "destapar inodoro", "destapar caneria", "arreglar lavamanos", "fix a water leak", "fix leak", "water leak", "clogged toilet"],
  electricidad: ["arreglar luz", "poner enchufe", "instalar toma", "problema electrico", "se fue la luz", "cambiar breaker", "electricista", "electrician"],
  pintura: ["pintar mi casa", "pintar cuarto", "pintar pared", "pintar sala", "paint my house", "paint my living room", "paint a room"],
  jardineria: ["cortar zacate", "cortar el zacate", "arreglar jardin", "limpiar jardin", "mantenimiento jardin"],
  mudanzas: ["mudarme", "hacer mudanza", "mover muebles", "necesito mudanza"],
  lavado_muebles: ["lavar sillon", "lavar sillones", "limpiar sofa", "lavar colchon", "lavado de muebles"],
  reparacion_computadoras: ["arreglar computadora", "arreglar laptop", "mi computadora no enciende", "reparar pc", "reparar laptop", "repair my laptop", "fix my laptop", "repair computer", "fix computer"],
  reparacion_celulares: ["arreglar celular", "pantalla quebrada", "cambiar pantalla", "reparar telefono", "mi celular no carga"],
  reparacion_impresoras: ["arreglar impresora", "mantenimiento impresora", "impresora atascada", "cambiar toner"],
  redes_internet: ["arreglar wifi", "mejorar internet", "instalar router", "poner internet", "problemas de wifi"],
  ciberseguridad: ["seguridad informatica", "proteger datos", "auditoria seguridad", "hacking etico"],
  cuidado_infantil: ["cuidar ninos", "cuidar mi hijo", "necesito ninera", "buscar ninera"],
  cuidado_adultos: ["cuidar adulto mayor", "cuidado para adulto mayor", "acompanar adulto mayor", "care for an older adult", "elderly care", "senior care"],
  veterinaria: ["llevar mascota al doctor", "doctor para perro", "doctor para gato", "veterinario para mascota", "veterinario a domicilio", "veterinarian", "veterinarian at home"],
  peluqueria_canina: ["banar perro", "cortar pelo perro", "grooming perro"],
  medicina_domicilio: ["doctor a domicilio", "medico a domicilio", "consulta medica"],
  medico_especialista: ["medico especialista", "especialista medico", "dermatologo", "ginecologo", "cardiologo", "traumatologo"],
  psiquiatria: ["psiquiatra", "consulta psiquiatrica", "medico salud mental"],
  laboratorio_clinico: ["examen de sangre", "laboratorio de sangre", "pruebas de laboratorio", "toma de muestras"],
  ambulancias_privadas: ["ambulancia privada", "traslado medico", "ocupo ambulancia"],
  fisioterapia: ["terapia fisica", "dolor de espalda", "fisioterapeuta", "necesito un fisioterapeuta", "physiotherapist", "physical therapist"],
  psicologia: ["necesito psicologo", "terapia psicologica", "hablar con psicologo", "psicologo en linea", "psychologist", "online psychologist"],
  contabilidad: ["contador", "contabilidad para mi negocio", "contabilidad negocio", "ayuda contable", "accountant", "accounting for my business"],
  notaria: ["notario publico", "autenticar documento", "hacer escritura", "traspaso de propiedad"],
  asesoria_tributaria: ["ayuda con hacienda", "declaracion de renta", "declaracion de iva", "impuestos"],
  corredor_seguros: ["corredor de seguros", "comprar seguro", "poliza", "seguro medico", "seguro de carro"],
  clases_manejo: ["aprender a manejar", "clases de conducir", "clases de manejo"],
  clases_baile: ["aprender a bailar", "clases de salsa", "clases de bachata", "academia de baile"],
  tutorias: ["clases particulares", "ayuda con tareas", "tutor para mi hijo"],
  costura_y_arreglos_de_ropa: ["hacer ruedo", "arreglar pantalon", "costurera", "sastre", "ajustar vestido", "arreglos de ropa"],
  lavanderia: ["lavar ropa", "planchado", "lavaseco", "lavar edredon"],
  diseno: ["diseño arte", "diseno arte", "diseño y arte", "diseno y arte", "diseño / arte", "necesito diseño", "necesito arte", "arte digital", "ilustracion", "ilustración", "artista", "diseñador"],
  fotografia: ["tomar fotos profesionales", "sesion de fotos", "fotografo profesional"],
  fotografia_eventos: ["fotografo para boda", "fotografo para evento", "fotos de quinceanos"],
  organizacion_eventos: ["organizar boda", "organizar fiesta", "event planner", "coordinador de eventos"],
  dj_sonido: ["musica para fiesta", "dj para fiesta", "sonido para evento", "dj for a party", "sound for event"],
  catering: ["comida para evento", "comida para fiesta", "banquete para evento"],
  mecanica: ["arreglar carro", "mecanico para carro", "mecanico en atenas", "revisar motor", "cambio de aceite", "mechanic", "mechanic in atenas"],
  mecanica_bicicletas: ["arreglar bicicleta", "reparar bici", "mecanico de bicicletas", "taller de bicicletas", "arreglar cleta"],
  grua: ["ocupo grua", "carro varado", "remolcar carro", "asistencia en carretera"],
  polarizado: ["polarizar carro", "poner polarizado", "lamina solar carro"],
  aire_acondicionado: ["arreglar aire acondicionado", "instalar aire acondicionado", "mantenimiento de aire"],
};

const NATURAL_STOPWORDS = new Set([
  "necesito", "ocupo", "quiero", "busco", "buscar", "alguien", "persona", "servicio", "servicios",
  "para", "por", "favor", "que", "me", "mi", "mis", "un", "una", "uno", "el", "la", "los", "las",
  "de", "del", "en", "con", "a", "al", "hacer", "tengo", "need", "looking", "look", "for", "someone",
  "service", "services", "to", "my", "the", "a", "an", "and", "please", "want", "house", "home",
]);

const TOKEN_ROOTS: Record<string, string> = {
  limpiar: "limpiez", limpio: "limpiez", limpia: "limpiez", limpieza: "limpiez",
  pintar: "pint", pintura: "pint", pintor: "pint", paint: "pint", painting: "pint",
  arreglar: "repar", reparar: "repar", reparacion: "repar", repair: "repar", repairing: "repar", fix: "repar", fixing: "repar",
  cuidar: "cuid", cuido: "cuid", cuidado: "cuid", care: "cuid", caregiving: "cuid",
  construir: "constru", construccion: "constru",
  moving: "mov", move: "mov", mover: "mud", mudanza: "mud",
  cleaning: "clean", clean: "clean", cleaned: "clean", plumbing: "plumb", plumber: "plumb",
};

function queryTokens(text: string): string[] {
  return normalizeText(text)
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .map((token) => TOKEN_ROOTS[token] ?? token)
    .filter((token) => token.length > 2 && !NATURAL_STOPWORDS.has(token));
}

function termsForCategory(item: CategoryItem & { groupId: string; groupLabel: string }, locale?: string): string[] {
  return [
    item.label,
    getCategoryLabel(item.id, locale),
    item.groupLabel,
    getCategoryGroupLabel(item.groupId, locale),
    ...item.keywords,
    ...(NATURAL_QUERY_ALIASES[item.id] ?? []),
  ];
}

export function resolveCategoryIntent(query: string, locale?: string): (CategoryItem & { groupId: string; groupLabel: string }) | null {
  const raw = query.trim();
  if (raw.length < 2) return null;
  const pool = getAllCategories();
  const q = normalizeText(raw);

  const matchingGroup = getAllCategoryGroups().find((group) => {
    const labels = [group.label, group.labelEn, getCategoryGroupLabel(group.id), getCategoryGroupLabel(group.id, "en")].filter(Boolean);
    return labels.some((label) => normalizeText(String(label)) === q);
  });
  if (matchingGroup) {
    const firstInGroup = pool.find((item) => item.groupId === matchingGroup.id);
    if (firstInGroup) return firstInGroup;
  }

  for (const item of pool) {
    if (termsForCategory(item, locale).some((term) => normalizeText(term) === q)) return item;
  }

  let best: { item: (CategoryItem & { groupId: string; groupLabel: string }); score: number } | null = null;
  const tokens = queryTokens(raw);
  for (const item of pool) {
    const terms = termsForCategory(item, locale);
    let score = 0;
    for (const term of terms) {
      const normalizedTerm = normalizeText(term);
      if (q.includes(normalizedTerm) || normalizedTerm.includes(q)) score += normalizedTerm === q ? 80 : 30;
      const termTokens = queryTokens(term);
      for (const token of tokens) {
        if (termTokens.includes(token)) score += 12;
        else if (termTokens.some((t) => t.includes(token) || token.includes(t))) score += 7;
      }
    }
    if (score > (best?.score ?? 0)) best = { item, score };
  }

  return best && best.score >= 14 ? best.item : null;
}

/* ─── English labels for the fixed taxonomy ───
   Spanish (in CATEGORY_GROUPS above) stays the source of truth; these are the
   per-language English labels so categories/services also render in English.
   Apply everywhere via getCategoryLabel(id, locale) / getCategoryGroupLabel. */
export const CATEGORY_LABELS_EN: Record<string, string> = {
  otro: "Other service",
  // Hogar y construcción
  plomeria: "Plumbing", electricidad: "Electrical", construccion: "Construction",
  maestro_obras: "Construction foreman",
  pintura: "Painting", carpinteria: "Carpentry", ebanisteria: "Fine woodworking", remodelacion: "Remodeling",
  techos: "Roofing", pisos: "Flooring", impermeabilizacion: "Waterproofing",
  fumigacion: "Pest control", cerrajeria: "Locksmith", aire_acondicionado: "Air conditioning",
  calentadores: "Water heaters", bombas_agua: "Water pumps", ventanas_puertas: "Windows & doors",
  vidrieria: "Glasswork", soldadura: "Welding", herreria: "Metalwork",
  gypsum: "Gypsum / Drywall", servicio_gas: "Gas service",
  reparacion_electrodomesticos: "Appliance repair",
  ingenieria_electrica: "Electrical engineering", ingenieria_mecanica: "Mechanical engineering",
  // Jardín y exterior
  jardineria: "Gardening", poda_arboles: "Tree pruning", paisajismo: "Landscaping",
  limpieza_piscinas: "Pool cleaning", riego_automatizado: "Automated irrigation",
  control_plagas: "Outdoor pest control",
  // Limpieza
  limpieza: "Home cleaning", limpieza_oficinas: "Office cleaning",
  desinfeccion: "Disinfection & sanitizing", lavado_alfombras: "Carpet & rug cleaning",
  lavado_muebles: "Upholstery cleaning", limpieza_post_construccion: "Post-construction cleaning",
  lavado_vehiculos: "Car washing",
  // Tecnología
  reparacion_computadoras: "Computer repair", redes_internet: "Networks & internet",
  tecnologia: "IT",
  camaras_seguridad: "Security cameras", domotica: "Smart home automation",
  desarrollo_web: "Web development", diseno_grafico: "Graphic design", diseno_apps: "Mobile app development",
  soporte_tecnico: "Tech support", ciberseguridad: "Cybersecurity", consultoria_ti: "IT consulting",
  reparacion_celulares: "Phone repair", reparacion_impresoras: "Printer repair",
  impresion_3d: "3D printing", audio_video: "Professional audio & video",
  // Servicios profesionales
  contabilidad: "Accounting & finance", legal: "Lawyers & legal services",
  notaria: "Notary services", auditoria: "Auditing",
  asesoria_financiera: "Financial advisory", corredor_seguros: "Insurance broker",
  asesoria_tributaria: "Tax advisory",
  ingenieria_civil: "Civil engineering", arquitectura: "Architecture", topografia: "Surveying",
  consultoria: "Business consulting", traduccion: "Translation & interpreting",
  recursos_humanos: "Human resources", marketing_digital: "Digital marketing",
  diseno: "Design and art", publicidad: "Advertising", redaccion_contenido: "Content writing",
  fotografia: "Professional photography", produccion_video: "Video production",
  capacitacion_empresarial: "Business training", gestoria_tramites: "Administrative errands",
  bienes_raices: "Real estate", avaluos: "Appraisals",
  consultoria_ambiental: "Environmental consulting", coaching: "Coaching",
  // Salud y bienestar
  entrenamiento_personal: "Personal training", entrenamiento_deportivo: "Sports training",
  nutricion: "Nutrition & dietetics",
  masajes: "Therapeutic massage", psicologia: "Psychology", psiquiatria: "Psychiatry",
  fisioterapia: "Physical therapy",
  odontologia: "Dentistry", ortodoncia: "Orthodontics", pediatria: "Pediatrics",
  optometria: "Optometry", optica_lentes: "Optical store & lenses",
  enfermeria: "Nursing", medicina_domicilio: "General medicine",
  medico_especialista: "Medical specialist", laboratorio_clinico: "Clinical laboratory",
  ambulancias_privadas: "Private ambulances",
  terapia_lenguaje: "Speech therapy", terapia_ocupacional: "Occupational therapy",
  podologia: "Podiatry", acupuntura: "Acupuncture & alternative medicine",
  cuidado_adultos: "Elderly care", cuidado_discapacidad: "Disability care",
  cuidado_infantil: "Childcare / Nanny",
  veterinaria: "Veterinary", peluqueria_canina: "Dog grooming", cuido_mascotas: "Pet sitting & dog walking",
  // Belleza y estética
  belleza: "Beauty services",
  peluqueria: "Hair & barber", maquillaje: "Makeup", unhas: "Nails / Manicure",
  pestanas: "Eyelashes", depilacion: "Hair removal", estetica_facial: "Facial aesthetics",
  spa: "Spa", bronceado: "Tanning",
  // Moda y cuidado personal
  costura_y_arreglos_de_ropa: "Sewing and clothing alterations",
  lavanderia: "Laundry", zapateria: "Shoe repair", relojeria: "Watch repair",
  joyeria: "Jewelry repair",
  // Educación y clases
  tutorias: "Academic tutoring", idiomas: "Languages", musica: "Music lessons",
  matematicas: "Math & science", preparacion_universitaria: "University prep",
  clases_manejo: "Driving lessons", clases_baile: "Dance classes",
  clases_cocina: "Cooking & baking classes",
  // Mudanzas y transporte
  mudanzas: "Moving", fletes: "Freight & hauling", mensajeria: "Courier & delivery",
  transporte_privado: "Private transportation", alquiler_vehiculos: "Vehicle rental",
  transporte_mascotas: "Pet transport",
  // Eventos
  fotografia_eventos: "Event photography", videografia: "Event videography",
  organizacion_eventos: "Event planning", chef: "Private chef & cooking",
  dj_sonido: "DJ & sound", catering: "Catering & banquets", decoracion: "Event decoration",
  alquiler_mobiliario: "Event furniture rental", maestro_ceremonias: "Master of ceremonies",
  floristeria: "Florist",
  animacion_infantil: "Kids entertainment", bartending: "Bartending",
  // Seguridad
  guardas_seguridad: "Security guards", alarmas: "Alarm installation",
  monitoreo_alarmas: "Alarm monitoring", cercas_electricas: "Electric fences",
  cctv: "Closed-circuit CCTV", control_acceso: "Access control",
  investigacion_privada: "Private investigation",
  // Vehículos y movilidad
  mecanica: "Auto mechanics", mecanica_bicicletas: "Bicycle repair",
  hojalateria: "Body work & car painting",
  electricidad_automotriz: "Auto electrical", tapiceria: "Upholstery",
  detailing: "Car detailing", polarizado: "Window tinting", cambio_llantas: "Tire change",
  grua: "Tow truck service",
  // Turismo
  agencia_viajes: "Travel agency", guia_turistico: "Tour guide",
  operador_turistico: "Tour operator", alquiler_vacacional: "Vacation rental",
};

export const CATEGORY_GROUP_LABELS_EN: Record<string, string> = {
  hogar: "Home & construction", jardin: "Garden & outdoor", limpieza: "Cleaning",
  tecnologia: "Technology", profesional: "Business services", salud: "Health & wellness",
  belleza: "Beauty & aesthetics", moda_y_cuidado_personal: "Fashion & personal care",
  educacion: "Education & classes",
  transporte: "Moving & transport", eventos: "Events", seguridad: "Security",
  automotriz: "Vehicles & mobility", turismo: "Tourism",
};

/* ─── Get category label from ID (locale-aware) ─── */
export function getCategoryLabel(id: string, locale?: string): string {
  const override = CATEGORY_CATALOG_OVERRIDES.get(id);
  if (override) {
    if (locale === "en" && override.labelEn) return override.labelEn;
    if (override.label) return override.label;
  }
  if (locale === "en" && CATEGORY_LABELS_EN[id]) return CATEGORY_LABELS_EN[id];
  if (id === "otro") return locale === "en" ? "Other service" : "Otro servicio";
  const found = ALL_CATEGORIES.find((c) => c.id === id);
  if (found) return found.label;
  // Admin-approved custom category (loaded on the client) — its real label.
  const custom = CUSTOM_CATEGORIES.find((c) => c.id === id);
  if (custom) return locale === "en" && custom.labelEn ? custom.labelEn : custom.label;
  // Unknown id → a readable label (never the raw key). New custom-category ids are
  // a clean slug (no prefix), but LEGACY ones were slugged as `sg_<name>`, so strip
  // that prefix before de-slugging (e.g. "sg_vendedor_de_botellas" → "Vendedor de
  // botellas") for back-compat — this is the server-side fallback when the dynamic
  // registry isn't loaded.
  return id
    .replace(/^sg_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/* ─── Get category GROUP label from group ID (locale-aware) ─── */
export function getCategoryGroupLabel(groupId: string, locale?: string): string {
  if (isOtherCategoryGroup(groupId)) return locale === "en" ? "Other categories" : "Otras categorías";
  const custom = CUSTOM_CATEGORY_GROUPS.find((group) => group.id === groupId);
  if (custom) return locale === "en" && custom.labelEn ? custom.labelEn : custom.label;
  if (locale === "en" && CATEGORY_GROUP_LABELS_EN[groupId]) return CATEGORY_GROUP_LABELS_EN[groupId];
  const g = CATEGORY_GROUPS.find((x) => x.id === groupId);
  return g?.label ?? groupId;
}

/* ─── Health categories (es_salud) — drive DOB behaviour. AUTHORITATIVE flag,
   never inferred from names; mirrors categories.es_salud in the DB (migration 036).
   ONLY genuinely MEDICAL/CLINICAL services (a patient is treated and clinical age
   matters) and CARE of a vulnerable person (a minor / an older or disabled adult,
   where the age is central to the request). Pure WELLNESS/fitness services are NOT
   medical and must NEVER ask for a date of birth — e.g. `entrenamiento_personal`
   (personal trainer) and `masajes` (massage) were removed for that reason. ─── */
export const HEALTH_CATEGORY_IDS = new Set<string>([
  // Clinical / medical (patient + clinical age)
  "nutricion", "psicologia", "fisioterapia", "enfermeria",
  "psiquiatria", "odontologia", "ortodoncia", "pediatria", "optometria", "optica_lentes",
  "medicina_domicilio", "terapia_lenguaje", "terapia_ocupacional",
  "podologia", "acupuntura", "medico_especialista", "laboratorio_clinico", "ambulancias_privadas",
  // Care of a vulnerable person (age is central — minor / older / disabled adult)
  "cuidado_adultos", "cuidado_discapacidad", "cuidado_infantil",
]);

/** True if the category is a health/medical category (DOB relevant). */
export function isHealthCategory(id?: string | null): boolean {
  if (!id) return false;
  const override = CATEGORY_FEATURE_OVERRIDES.get(id)?.esSalud;
  return typeof override === "boolean" ? override : HEALTH_CATEGORY_IDS.has(id);
}

/* ─── CARE categories — a SUBSET of health that is CARE of a person (not a clinical
   consult). Used only to pick natural wording in the booking "¿Para quién?" block:
   a CARE recipient is "la persona", not "el paciente" (a niñera's child isn't a
   "patient"). Everything else in HEALTH_CATEGORY_IDS is clinical → "paciente". ─── */
export const CARE_CATEGORY_IDS = new Set<string>([
  "cuidado_adultos", "cuidado_discapacidad", "cuidado_infantil",
]);

/** True if the category is CARE of a person (vs a clinical consult). */
export function isCareCategory(id?: string | null): boolean {
  return !!id && CARE_CATEGORY_IDS.has(id);
}

/** True if ANY of the professional's categories is a health category. */
export function anyHealthCategory(ids?: (string | null | undefined)[]): boolean {
  return (ids ?? []).some((id) => isHealthCategory(id));
}

/* ─── Get category IDs that match a text query (for search page) ─── */
/*
   Video consult categories. This is an explicit allow-list: some health services
   need in-person care, while some non-health services work very well remotely.
*/
export const VIDEO_CONSULT_CATEGORY_IDS = new Set<string>([
  "nutricion", "psicologia", "fisioterapia", "medicina_domicilio",
  "psiquiatria", "medico_especialista", "terapia_lenguaje", "terapia_ocupacional",
  "contabilidad", "legal", "consultoria", "traduccion",
  "notaria", "auditoria", "asesoria_financiera", "corredor_seguros",
  "asesoria_tributaria", "recursos_humanos", "marketing_digital", "publicidad",
  "diseno", "redaccion_contenido", "capacitacion_empresarial", "gestoria_tramites",
  "bienes_raices", "avaluos", "consultoria_ambiental", "coaching",
  "arquitectura", "ingenieria_civil", "ingenieria_electrica", "ingenieria_mecanica",
  "desarrollo_web", "diseno_grafico", "diseno_apps", "soporte_tecnico",
  "ciberseguridad", "consultoria_ti",
  "tutorias", "idiomas", "musica", "matematicas",
  "preparacion_universitaria", "entrenamiento_personal",
]);

export function supportsVideoConsultCategory(id?: string | null): boolean {
  if (!id) return false;
  const override = CATEGORY_FEATURE_OVERRIDES.get(id)?.supportsVideoconsulta;
  return typeof override === "boolean" ? override : VIDEO_CONSULT_CATEGORY_IDS.has(id);
}

export function anyVideoConsultCategory(ids?: (string | null | undefined)[]): boolean {
  return (ids ?? []).some((id) => supportsVideoConsultCategory(id));
}

const HEALTH_SUGGESTION_TERMS = [
  "medic", "doctor", "clinica", "consulta", "salud", "terapia", "terapeuta",
  "psicolog", "nutric", "fisioter", "odont", "pediatr", "optometr",
  "psiquiatr", "ortodon", "laboratorio", "ambulancia", "enfermer", "paciente",
  "rehabilit", "lenguaje", "ocupacional", "optica", "lentes",
  "podolog", "acupunt", "cuidad", "adulto mayor", "nino", "niño",
  "discapacidad",
];

const VIDEO_CONSULT_SUGGESTION_TERMS = [
  ...HEALTH_SUGGESTION_TERMS,
  "asesor", "consult", "contab", "finanza", "legal", "abogado",
  "marketing", "publicidad", "redaccion", "diseno", "diseño", "web", "app", "program", "soporte",
  "tutor", "clase", "idioma", "profesor", "coach", "arquitect",
  "ingenier", "ciberseguridad", "tribut", "impuesto", "notari", "auditor",
];

export function classifySuggestedCategory(name: string): {
  healthLikely: boolean;
  videoConsultLikely: boolean;
} {
  const q = normalizeText(name);
  if (!q) return { healthLikely: false, videoConsultLikely: false };
  const includesAny = (terms: string[]) => terms.some((term) => q.includes(normalizeText(term)));
  const healthLikely = includesAny(HEALTH_SUGGESTION_TERMS);
  return {
    healthLikely,
    videoConsultLikely: healthLikely || includesAny(VIDEO_CONSULT_SUGGESTION_TERMS),
  };
}

export function getMatchingCategoryIds(query: string): string[] {
  if (!query.trim()) return [];
  const normalizedQuery = normalizeText(query);
  const inferred = resolveCategoryIntent(query);
  const embeddedMatches = ALL_CATEGORIES.filter((category) => {
    const terms = [category.label, ...(category.keywords ?? [])]
      .filter((term): term is string => !!term)
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 3);
    return terms.some((term) => normalizedQuery.includes(term) || term.includes(normalizedQuery));
  }).map((category) => category.id);
  return [...new Set([
    ...(inferred ? [inferred.id] : []),
    ...embeddedMatches,
    ...searchCategories(query).map((c) => c.id),
  ])];
}

/* ─── Legacy flat CATEGORIES array (kept for backwards compat) ─── */
export const CATEGORIES = ALL_CATEGORIES.map(({ id, keywords }) => ({
  id,
  icon: "",
  keywords,
}));
