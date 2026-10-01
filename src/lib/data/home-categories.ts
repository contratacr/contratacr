/** Oficios que rota la portada; la sección los filtra por oferta real. */
// ORDEN = DEMANDA REAL. Personas distintas que buscaron cada servicio en
// producción, 2-ago → 1-oct-2026 (interaction_events, search_performed). Lo más
// buscado sale primero; la sección igual esconde lo que tiene <2 profesionales.
// Revisar cada pocos meses con la misma consulta.
export const HOME_CATEGORIES: string[] = [
  "electricidad", "reparacion_electrodomesticos", "pintura", "construccion", "plomeria",
  "nutricion", "fisioterapia", "mecanica", "desarrollo_web", "legal", "mudanzas",
  "remodelacion", "aire_acondicionado", "psicologia", "soporte_tecnico",
  "entrenamiento_personal", "electromecanica", "soldadura", "carpinteria", "limpieza",
  "jardineria", "contabilidad", "marketing_digital", "cerrajeria", "camaras_seguridad",
  "alarmas", "limpieza_piscinas", "techos", "pisos", "masajes", "reparacion_computadoras",
  "poda_arboles", "peluqueria", "fotografia", "dj_sonido",
];
