# Contactos del directorio (WhatsApp, Llamar, redes) - 2026-11-27

Objetivo: que más lugares muestren WhatsApp y Llamar en /negocios/[slug], solo con datos reales de OpenStreetMap (OSM). No se consulta ningún sitio web.

## Qué se encontró en el extracto OSM (43 059 lugares importados)
- Teléfono (phone, contact:phone, mobile): unos 4 030 lugares. La importación original guardaba 3 870 (rechazaba formatos como "(506) 2442-2422" o números solo en mobile).
- WhatsApp explícito (contact:whatsapp, whatsapp): 17 lugares. Es todo lo que OSM tiene; no se deduce WhatsApp de teléfonos fijos.
- Redes (contact:facebook, instagram, tiktok, twitter, youtube, linkedin y las claves sin prefijo): unos 240 lugares.

## Qué se llenó (base local)
Antes -> después: teléfonos 4 175 -> 4 335 (+160), WhatsApp 2 -> 19 (+17), lugares con redes 4 -> 193 (+189).
WhatsApp por sección: health 2, lodging 5, retail 4, transport 2, tours 1, vet_pets 1, pharmacy 1, restaurant 1, parking y car_wash (ya existentes).

## Reglas (scripts/directory/osm-contact.mjs)
- Teléfono: phone, luego contact:phone, luego mobile / contact:mobile / phone:mobile. Primer valor si hay varios separados por ";". Costa Rica se guarda como +506XXXXXXXX (8 dígitos, prefijos 2,4,5,6,7,8); 800/900/905 sin cambio; otros países con código "+".
- WhatsApp: contact:whatsapp / whatsapp / phone:whatsapp con un número o enlace wa.me; whatsapp=yes solo junto a un celular costarricense (5,6,7,8) del propio lugar; o un celular cuyo valor dice "WhatsApp". Nunca desde un fijo.
- Redes: scripts/directory/osm-social.mjs, en attributes.social (lo lee place-social.ts).
- La importación (stage-import.mjs) aplica las mismas reglas a lugares nuevos.

## Relleno de lugares ya importados
`node scripts/directory/backfill-contacts.mjs` (simulación) y `--apply` (escribe). Une cada lugar por su id OSM (dir_field_provenance, fuente osm), rellena solo campos vacíos, omite lugares reclamados, con administrador o eliminados, y escribe con dir_place_mutate (historial y procedencia). Idempotente: una segunda ejecución no cambia nada. Rechaza bases que no sean locales salvo PRO_LOCAL_DB_OK.

## Plan para test y producción
Mismo script, solo con la autorización de Isaac: primero test (con el mismo extracto), revisar conteos, luego producción. Requiere antes la migración 539 (clave social) en cada entorno.
