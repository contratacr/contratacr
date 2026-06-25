import { CATEGORY_GROUPS } from "@/lib/data/categories";

// ─── Per-category service IMAGES (sprint 512) ────────────────────────────────
// Real, curated photos (Unsplash CDN, same approach as the landing carousel/explore-tabs)
// keyed by CATEGORY id. A category WITHOUT an entry here falls back to a branded gradient +
// the group icon (see <ServiceImage>), so EVERY category always has a fitting visual.
//
// EASY TO EXTEND / REPLACE: just add or change a line —
//   nutricion: "https://images.unsplash.com/photo-XXXX?w=800&auto=format&fit=crop&q=80",
// (the owner reviews + swaps any that don't match, or uploads better ones later).
//
// "v" = verified (reused from the live landing carousel/explore-tabs, known-good).
// The rest are best-effort matches; broken URLs degrade to the branded fallback via onError.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&auto=format&fit=crop&q=80`;

export const CATEGORY_IMAGE: Record<string, string> = {
  // ── Hogar y construcción ──
  plomeria: U("1607472586893-edb57bdc0e39"),            // v
  electricidad: U("1621905251189-08b45d6a269e"),        // v
  construccion: U("1504307651254-35680f356dfd"),        // v
  pintura: U("1562259949-e8e7689d7828"),                // v
  carpinteria: U("1685022515782-534dfba3a2c4"),         // Unsplash: Jean-Baptiste D.
  pisos: U("1586023492125-27b2c045efd7"),               // v (explore-tabs)
  cerrajeria: U("1558002038-1055907df827"),
  techos: U("1632759145351-1d592919f522"),
  remodelacion: U("1503387762-592deb58ef4e"),
  // ── Jardín y exterior ──
  jardineria: U("1416879595882-3373a0480b5b"),          // v
  poda_arboles: U("1611843467160-25afb8df1074"),
  paisajismo: U("1558904541-efa843a96f01"),
  limpieza_piscinas: U("1576013551627-0cc20b96c2a7"),
  // ── Limpieza ──
  limpieza: U("1581578731548-c64695cc6952"),            // v
  limpieza_oficinas: U("1497366216548-37526070297c"),
  lavado_vehiculos: U("1605164599901-db7f68c4b1a8"),
  // ── Tecnología (verified tech photo reused for related ids) ──
  tecnologia: U("1518770660439-4636190af475"),          // v
  desarrollo_web: U("1547658719-da2b51169166"),
  reparacion_computadoras: U("1518770660439-4636190af475"),  // v
  soporte_tecnico: U("1581092921461-eab62e97a780"),
  redes_internet: U("1544197150-b99a580bb7a8"),
  diseno_grafico: U("1626785774573-4b799315345d"),
  diseno_apps: U("1512941937669-90a1b58e7e9c"),
  // ── Servicios empresariales ──
  contabilidad: U("1554224155-6726b3ff858f"),
  legal: U("1589829545856-d10d557cf95f"),
  consultoria: U("1454165804606-c3d57bc86b40"),
  marketing_digital: U("1460925895917-afdab827c52f"),
  fotografia: U("1452587925148-ce544e77e70d"),
  produccion_video: U("1574717024653-61fd2cf4d44d"),
  bienes_raices: U("1560518883-ce09059eeffa"),
  traduccion: U("1456513080510-7bf3a84b82f8"),
  // ── Salud y bienestar ──
  fisioterapia: U("1571019613454-1cb2f99b2d8b"),
  entrenamiento_personal: U("1534438327276-14e5300c3a48"),
  entrenamiento_deportivo: U("1517649763962-0c623066013b"),
  nutricion: U("1490645935967-10de6ba17061"),
  masajes: U("1600334129128-685c5582fd35"),
  psicologia: U("1573497019940-1c28c88b4f3e"),
  odontologia: U("1606811841689-23dfddce3e95"),
  medicina_domicilio: U("1576091160550-2173dba999ef"),
  pediatria: U("1632053002928-1919f1c9c84e"),
  enfermeria: U("1576765608535-5f04d1e3f289"),
  veterinaria: U("1628009368231-7bb7cfcb0def"),
  cuido_mascotas: U("1450778869180-41d0601e046e"),
  peluqueria_canina: U("1591946614720-90a587da4a36"),
  cuidado_adultos: U("1576765608535-5f04d1e3f289"),
  // ── Belleza y estética (verified belleza photo reused) ──
  peluqueria: U("1560066984-138dadb4c035"),             // v
  maquillaje: U("1487412947147-5cebf100ffc2"),
  unhas: U("1604654894610-df63bc536371"),
  estetica_facial: U("1570172619644-dfd03ed5d881"),
  depilacion: U("1626954079979-ec4f7b05e032"),
  // ── Educación y clases ──
  tutorias: U("1503676260728-1c00da094a0b"),
  idiomas: U("1546410531-bb4caa6b424d"),
  musica: U("1511379938547-c1f69419868d"),
  matematicas: U("1635070041078-e363dbe005cb"),
  clases_cocina: U("1556910103-1c02745aae4d"),
  clases_manejo: U("1449965408869-eaa3f722e40d"),
  // ── Mudanzas y transporte (verified) ──
  mudanzas: U("1600518464441-9154a4dea21b"),            // v
  fletes: U("1601584115197-04ecc0da31d7"),
  mensajeria: U("1586528116311-ad8dd3c8310d"),
  // ── Eventos ──
  fotografia_eventos: U("1519741497674-611481863552"),
  videografia: U("1492684223066-81342ee5ff30"),
  dj_sonido: U("1547210841-2ceb0c5f0679"),              // Unsplash: Krys Amon
  chef: U("1577219491135-ce391730fb2c"),
  catering: U("1555244162-803834f70033"),
  decoracion: U("1478146896981-b80fe463b330"),
  bartending: U("1514362545857-3bc16c4c7d1b"),
  // ── Seguridad (verified) ──
  seguridad: U("1557597774-9d273605dfa9"),              // v
  cctv: U("1557597774-9d273605dfa9"),                   // v
  camaras_seguridad: U("1557597774-9d273605dfa9"),      // v
  guardas_seguridad: U("1551836022-d5d88e9218df"),
  alarmas: U("1558002038-1055907df827"),
  // ── Automotriz (verified mecánica photo reused) ──
  mecanica: U("1625047509248-ec889cbff17f"),            // v
  hojalateria: U("1599256621730-535171e28e50"),
  electricidad_automotriz: U("1625047509248-ec889cbff17f"),  // v
  detailing: U("1605164599901-db7f68c4b1a8"),
  cambio_llantas: U("1486262715619-67b85e0b08d3"),
};

// CATEGORY id → its catalog GROUP id (drives the branded fallback gradient + icon).
const ID_TO_GROUP = new Map<string, string>();
for (const g of CATEGORY_GROUPS) for (const it of g.items) ID_TO_GROUP.set(it.id, g.id);

export function categoryImageUrl(id: string): string | undefined {
  return CATEGORY_IMAGE[id];
}
export function categoryGroupId(id: string): string {
  return ID_TO_GROUP.get(id) ?? "";
}
