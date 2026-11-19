/**
 * Costa Rican Spanish + English intent vocabulary mapped to directory verticals.
 * Accent- and case-insensitive. Entries marked "UNCERTAIN" are slang or ambiguous
 * terms that need native-speaker review before relying on them.
 */
export type DirectoryVertical =
  | "vehiculos"
  | "inmuebles"
  | "restaurantes"
  | "gasolineras"
  | "farmacias"
  | "supermercados"
  | "parqueos"
  // 2026-11-17 place sections (src/lib/directory/place-verticals.ts). Trade words that also name a professional
  // service («mecánico», «plomero», «estilista») are left out on purpose: those searches belong to professionals.
  | "cafes"
  | "pulperias"
  | "ferreterias"
  | "hospedaje"
  | "salud"
  | "veterinarias"
  | "talleres"
  | "belleza"
  | "gimnasios"
  | "tours"
  | "bancos";

export const VERTICAL_VOCABULARY: Record<DirectoryVertical, readonly string[]> = {
  vehiculos: [
    "carro", "carros", "auto", "autos", "automovil", "vehiculo", "vehiculos", "moto", "motos", "motocicleta",
    "pickup", "pick up", "camioneta", "4x4", "doble cabina", "sedan", "suv", "hatchback", "microbus", "camion",
    "usado", "usados", "semi nuevo", "agencia de autos", "car", "cars", "truck", "motorcycle", "used car",
    "cuadra", // UNCERTAIN: CR slang for ATV/quad (cuadraciclo); also means city block
    "cuadraciclo", "bajaj", "scooter", "tuk tuk",
    "chuzo", // UNCERTAIN: pejorative slang for an old/cheap vehicle
    "carrito", // UNCERTAIN: diminutive, usually a small car
    "traila", // UNCERTAIN: CR for trailer/semi-trailer
    "cabezal",
  ],
  inmuebles: [
    "casa", "casas", "apartamento", "apartamentos", "apartment", "condominio", "alquiler", "alquileres", "renta",
    "venta de casa", "lote", "lotes", "terreno", "finca", "quinta", "local comercial", "bodega", "oficina",
    "bienes raices", "house", "rent", "for rent", "for sale", "land", "real estate", "townhouse", "cuarto",
    "apartamento amueblado", "residencial",
    "propiedad", "propiedades",
    "choza", // UNCERTAIN: rustic cabin/hut in some regions
  ],
  restaurantes: [
    "soda", "sodas", "restaurante", "restaurantes", "restaurant", "almuerzo", "desayuno", "cena", "casado",
    "gallo pinto", "comida", "comida rapida", "pizzeria", "pizza", "marisqueria",
    "food", "lunch", "breakfast", "dinner", "sushi", "hamburguesa", "pollo frito",
    "chifrijo", "bocas", "menu", "a domicilio", "delivery",
    "restau", // UNCERTAIN: colloquial abbreviation
  ],
  gasolineras: [
    "gasolinera", "gasolineras", "gasolina", "bomba", "bombas", "estacion de servicio", "diesel", "regular",
    "combustible", "combustibles", "gas station", "fuel", "petrol", "gas", "recope",
    "bomba de gasolina",  ],
  farmacias: [
    "farmacia", "farmacias", "botica", "medicina", "medicinas", "medicamento", "medicamentos", "pharmacy",
    "drugstore", "pastillas", "receta", "droguería", "drogueria", "fischel", "sucre",
  ],
  supermercados: [
    "supermercado", "supermercados", "super", "super mercado", "supermarket", "grocery", "groceries", "abarrotes", "mercado",
    "automercado", "maxi pali", "pali", "masxmenos", "walmart", "mas x menos", "megasuper", "perimercados", "pricesmart",
    "verduleria", "carniceria", "feria del agricultor",
    "mandado", // UNCERTAIN: CR for grocery run
  ],
  cafes: [
    "cafe", "cafes", "cafeteria", "cafeterias", "panaderia", "panaderias", "reposteria", "pasteleria", "heladeria", "bar", "bares",
    "cantina", "pub", "cerveceria", "coffee shop", "bakery", "ice cream", "brunch",
  ],
  pulperias: [
    "pulperia", "pulperias", "pulpe", "abastecedor", "abastecedores", "minisuper", "mini super", "kiosco", "corner store", "convenience store",
  ],
  ferreterias: [
    "ferreteria", "ferreterias", "materiales de construccion", "deposito de materiales", "pintura", "pinturas", "tornillos", "cemento",
    "hardware store", "building materials", "paint store",
  ],
  hospedaje: [
    "hotel", "hoteles", "hostal", "hostales", "hospedaje", "cabinas", "posada", "bed and breakfast", "lodge", "glamping", "camping",
    "hostel", "lodging", "where to stay",
  ],
  salud: [
    "clinica", "clinicas", "consultorio", "consultorios", "ebais", "hospital", "hospitales", "dentista", "odontologia", "laboratorio clinico",
    "optica", "fisioterapia", "clinic", "dentist", "hospital near me", "medical laboratory",
  ],
  veterinarias: [
    "veterinaria", "veterinarias", "veterinario", "tienda de mascotas", "pet shop", "estetica canina", "grooming", "vet", "vets",
    "veterinary", "alimento para perro",
  ],
  talleres: [
    "taller", "talleres", "taller mecanico", "lavacar", "lava car", "llantera", "llanteras", "repuestos", "riteve", "revision tecnica",
    "car wash", "car repair", "tyre shop", "auto parts",
  ],
  belleza: [
    "salon de belleza", "barberia", "barberias", "peluqueria", "peluquerias", "estetica", "unas", "spa", "manicure", "tatuajes",
    "barber shop", "beauty salon", "nail salon",
  ],
  gimnasios: [
    "gimnasio", "gimnasios", "gym", "gyms", "crossfit", "yoga", "pilates", "artes marciales", "fitness",
  ],
  tours: [
    "tour", "tours", "atraccion", "atracciones", "museo", "museos", "canopy", "zoologico", "parque tematico", "agencia de viajes",
    "attraction", "museum", "things to do",
  ],
  bancos: [
    "banco", "bancos", "cajero", "cajeros", "cajero automatico", "atm", "bank", "banks", "casa de cambio", "sucursal bancaria",
  ],
  parqueos: [
    "parqueo", "parqueos", "parqueadero", "estacionamiento", "parking", "garaje", "garage", "cochera",
    "parqueo publico", "valet", "park",
  ],
};

export function normalizeIntentText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Entry = { vertical: DirectoryVertical; term: string };
// Terms that are too ambiguous alone to attribute a vertical with full weight.
const AMBIGUOUS = new Set(["super", "regular", "gas", "park", "bar", "cafe", "menu", "mercado", "cuarto", "renta", "cuadra",
  "pintura", "cemento", "taller", "spa", "yoga", "estetica", "unas", "camping", "hospital", "grooming", "fitness", "tour", "tours", "vet"]);

const ENTRIES: Entry[] = (Object.entries(VERTICAL_VOCABULARY) as [DirectoryVertical, readonly string[]][])
  .flatMap(([vertical, terms]) => terms.map((t) => ({ vertical, term: normalizeIntentText(t) })))
  .filter((e) => e.term);

export type VerticalMatch = { vertical: DirectoryVertical; score: number; terms: string[] };

/**
 * Matches whole words/phrases (accent-insensitive). Score: 2 per unambiguous term, 1 per ambiguous.
 * Sorted by score desc then vertical name. Returns [] when nothing matches.
 */
export function matchVerticals(text: string): VerticalMatch[] {
  const padded = ` ${normalizeIntentText(text)} `;
  if (padded.trim() === "") return [];
  const found = new Map<DirectoryVertical, VerticalMatch>();
  for (const { vertical, term } of ENTRIES) {
    if (!padded.includes(` ${term} `)) continue;
    const m = found.get(vertical) ?? { vertical, score: 0, terms: [] };
    if (!m.terms.includes(term)) {
      m.terms.push(term);
      m.score += AMBIGUOUS.has(term) ? 1 : 2;
    }
    found.set(vertical, m);
  }
  return [...found.values()].sort((a, b) => b.score - a.score || (a.vertical < b.vertical ? -1 : 1));
}

export function detectVertical(text: string): DirectoryVertical | null {
  return matchVerticals(text)[0]?.vertical ?? null;
}
