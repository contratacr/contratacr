# Plan multivertical ContrataCR (LOCAL, 2026-11-16)
Estado: plan aprobado para ejecutar en el worktree Pro (local, sin publicar). Fuentes: scratchpad research-verticales/*.md.

## Decisiones del dueño
Marca ContrataCR. Secciones: vehículos (carros, motos, otros; agencias y particulares), bienes raíces, restaurantes, gasolineras, farmacias, supermercados, comparador de precios. Aparecer y verificarse es gratis; el orden nunca depende del pago; Pro gratis al lanzamiento (cobro tras un interruptor apagado); asistente público gratis, IA Pro más potente.
Valores por defecto (cambiables): rutas /vehiculos y /inmuebles; ficha canónica /negocios/[slug]; semilla OSM en tabla separada con atribución; particulares con límites; farmacias exigen license_verified; sin patrocinados al lanzamiento; sin precios de medicamentos con receta.

## Modelo
Núcleo genérico dir_places (lugares) y dir_listings (anuncios) + tablas de extensión por vertical (dir_place_restaurant/fuel/pharmacy/grocery, dir_listing_vehicle/property) + attributes jsonb acotado. Procedencia por campo (dir_data_sources, dir_field_provenance). Reclamo dir_place_claims/dir_place_managers (OTP al teléfono de la ficha, Hacienda, documento, dominio); nunca pagos. Precios: price_items + price_observations (fuente, fecha, evidencia, vigencia, confianza) + price_staleness_rules + public_price_current. Reseñas dir_reviews (mismas reglas que reviews). country_code/currency/admin_area_* para multi-país.
Pro: pro_workspace_editions, pro_workspace_modules, pro_billing_switches(paywall_enabled=false), pro_has_module/pro_module_require, helper único pro_entitled (refactor de 6 módulos que copian la regla de acceso).

## Rondas
F0 neutralidad (quitar is_featured de query-core.ts:208 y professionals.ts:658, /como-ordenamos, DIRECTORIO_VISIBLE, script de neutralidad) · F1 núcleo de lugares + /negocios/[slug] · F2 importación semilla y procedencia · F3 reclamo, verificación y acceso unificado (regresión completa) · F4 ediciones y módulos · F5 reseñas de lugares · F6 búsqueda y facetas + listados /restaurantes /farmacias /supermercados /gasolineras.
Vehículos V1 anuncios+catálogo · V2 inventario Pro Autos · V3 fotos y antifraude · V4 páginas públicas · V5 solicitudes y prueba de manejo · V6 particulares · V7 calculadora y métricas.
Bienes raíces R1 público (ubicación difuminada) · R2 Pro inmobiliaria · R3 particulares y alquiler (avisos antiestafa).
Precios/comercio P1 núcleo + combustibles ARESEP · P2 menús · P3 farmacias/supermercados GTIN + MEIC · P4 reportes de usuarios. Asistente A1 (nivel 0) · A2 (v2 con herramientas sobre las mismas RPC, sin señales de pago).
Cada ronda: SQL *-local.sql + manifiesto, prueba SQL PGlite, rutas, UI ES/EN, E2E tests/e2e/pro-dir-*.spec.ts, ownership + site-routes, doc.

## Riesgos y abogado
Ver lista completa en el informe del plan (clasificados, Ley 8204, corretaje, medicamentos Decreto 36868-S, licencias MEIC/ARESEP/OSM/GS1, IVA+servicio en menús, calculadora de cuota, patrocinados, Ley 8968/PRODHAB, disputas de reclamo, asistente y salud). Límite de frecuencia en memoria no sirve en Workers: resolver antes de abrir al público.
