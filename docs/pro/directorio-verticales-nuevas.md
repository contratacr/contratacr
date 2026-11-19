# Directorio: secciones nuevas (aprobación del 2026-11-17) — LOCAL PRO

Estado: implementado solo en la rama local `local/pro-suite-no-push` (páginas visibles solo en desarrollo).
**Las reglas de política de este documento están PENDIENTES DE REVISIÓN LEGAL** (abogado) antes de cualquier publicación.

## Secciones

| Ruta (ES y EN) | `dir_verticals.id` | Nombre EN | Tipos (`attributes.kind`) | Precio |
|---|---|---|---|---|
| /cafes | cafe_bar | Cafés, bakeries and bars | cafe, bakery, bar, pub, ice_cream, coffee_shop | menú (mediana, como restaurantes) |
| /pulperias | convenience | Corner stores | pulperia, minisuper, kiosk | producto (como supermercados, sin medicamentos) |
| /ferreterias | hardware | Hardware stores | hardware, paint, building_materials, electrical, bathroom, diy, trade | producto |
| /hospedaje | lodging | Lodging | hotel, hostel, guest_house, cabins, apartment, motel, camping | ninguno |
| /salud | health | Health | clinic, doctors, dentist, hospital, laboratory, physiotherapy, psychology, optician, other (+ `publicService`) | ninguno |
| /veterinarias | vet_pets | Vets and pet shops | veterinary, pet_shop, grooming, boarding | producto (solo productos de tienda, nunca consultas ni medicamentos) |
| /talleres | auto_services | Car services | repair, motorcycle_repair, car_wash, tyres, inspection, parts | ninguno |
| /belleza | beauty | Beauty | hairdresser, barber, beauty, nails, massage, spa, tattoo | ninguno |
| /gimnasios | fitness | Gyms | gym, yoga, crossfit, pilates, dance, martial_arts, sports_centre | ninguno |
| /tours | tours | Tours and attractions | attraction, museum, zoo, theme_park, aquarium, gallery, water_park, tour_operator, travel_agency | ninguno |
| /bancos | banking | Banks and ATMs | bank, atm, exchange (+ `atm`, `operator`) | ninguno (solo mapa) |

Fuente única en código: `src/lib/directory/place-verticals.ts` (mismos ids, rutas y claves que `dir_verticals`).
El orden nunca depende de pagos (mismos criterios de `/como-ordenamos`).

Decisiones de precio: hospedaje (tarifas variables por fecha, no las publicamos), talleres/belleza/gimnasios (servicio
a cotizar; no hay soporte trivial), tours, salud (prohibido mostrar precios de consultas) y bancos (sin tasas ni
productos) no tienen filtro ni orden por precio. En bancos y salud la base de datos rechaza registrar precios
(`price_section_off`).

## Políticas (pendiente de revisión legal)

- **Salud y veterinarias**: solo establecimientos. Los nombres que son claramente una persona («Dr. Juan Pérez») no se
  importan; los que empiezan con Dr./Dra./Lic. pero nombran un establecimiento se importan y quedan en la lista de
  revisión (`$S/osm-stage2/review.json`: 45 omitidos, 3 a revisar). Sin consejo médico ni veterinario, sin precios de
  consultas, línea neutra «Habilitación sin verificar por ContrataCR» (mismo patrón que farmacias,
  `requires_license=false`), reseñas permitidas solo sobre atención y servicio con nota visible.
- **Bancos y cajeros**: puntos de mapa con horario. Sin tasas, comisiones ni productos, sin reseñas (la base de datos
  las rechaza: `review_section_off`), sin precios. La ficha se puede reclamar solo para mantener los datos.
- **Hospedaje y tours**: no afirmamos declaratoria turística del ICT ni categorías oficiales de estrellas.
- **Excluidos al importar**: farmacias (ya están en /farmacias), cerrajerías, aparatos de ejercicio al aire libre,
  clubes nocturnos y de striptease y cualquier lugar para adultos, tiendas de cosméticos, miradores, supermercados como
  pulperías y tiendas de gasolineras (marca de combustible o a ≤ 65 m de una gasolinera).

## Importación (OpenStreetMap, ODbL con atribución)

- `scripts/directory/stage-import.mjs`: `classifyTags()` (prioridad: adultos → farmacia → gasolinera → hospedaje →
  restaurante → café/bar → supermercado → pulpería → agencia de vehículos → talleres → salud → veterinarias →
  belleza → gimnasios → ferreterías → tours → bancos → inmobiliarias), `--only`, `--fuel-points`, `--review-out`,
  duplicados del mismo nombre a ≤ 50 m dentro de la misma sección (la base sigue aplicando su regla de 75 m).
- Cafés: los 849 elementos de OSM que eran `restaurant` por `amenity=cafe` se movieron por referencia con
  `dir_import_reclassify` (mismo slug e id, reseñas y fotos intactas, procedencia e historial antes/después): 781
  movidos, 68 nunca habían sido importados. Además, 5 hoteles con restaurante pasaron de restaurante a hospedaje. Las
  fichas reclamadas o administradas nunca se mueven (decide el dueño).
- Resultado en la base local (publicadas): hospedaje 3 599, cafés 3 441 (781 movidos), salud 2 195 (1 135 públicos),
  pulperías 2 069, talleres 1 659, bancos 1 125 (453 sucursales con cajero), ferreterías 794, tours 706, belleza 702,
  gimnasios 415, veterinarias 316. Restaurantes publicados: 6 649.
- Extras (horario, sitio web, correo) del mismo volcado: 881 horarios, 976 sitios, 458 correos aplicados.
