# Fotos e íconos de secciones, grupos y servicios

Regla de Isaac (2026-11-27): una sección de negocios, una variante, un grupo de servicios o un servicio muestra **siempre la misma foto y el mismo ícono** en todo el app. Si el mismo nombre sale en Servicios y en Negocios (Belleza, Salud, Educación), también es la misma foto y el mismo ícono. Cambia el tamaño, nunca la imagen ni el dibujo.

## Una sola fuente

- `src/lib/visuals/section-visuals.ts` (datos y funciones, sin JSX):
  - Negocios: `sectionPhoto(id, ancho)`, `sectionIcon(id)`; `id` es una sección (`talleres`) o una variante fija (`cafes:bares`).
  - Verticales del directorio: `verticalSection(v)`, `sectionIconForVertical(v)`, `sectionPhotoForVertical(v, ancho)`. Siempre dan lo mismo que su sección.
  - Grupos de lugares de `/lugares`: `placeGroupIcon(id)`.
  - Servicios: `categoryPhoto(id, ancho)`, `categoryIcon(id)` (el ícono del grupo del servicio, como lo dibuja producción en `/servicios`), `serviceGroupPhoto(id, ancho)` y `serviceGroupIcon(id)`.
- `src/lib/visuals/section-icon.tsx`: `<SectionIcon id=… | vertical=… size=… active />`, `<CategoryIcon id=… | group=… />` e `<IconBadge icon=… />`. Es el ícono "mejorado" de producción, el de la fila redonda Profesionales · Negocios · Solicitudes · Promociones · Empleos (`components/landing/guia-de-la-app.tsx`): círculo con el degradado celeste suave `.ccr-caja-icono` (`globals.css`) y el dibujo de contorno azul marino #162543 (trazo 1.8). `active` es el estado elegido de esa fila: degradado azul de marca, dibujo blanco y brillo azul suave (los mismos valores de `CAJA_ACTIVA`). Tamaños: `sm` 32 px, `md` 36 px, `lg` 44 px y `xl` 56 px. El avatar de un negocio sin foto (`PlaceSectionAvatar`) también usa `SectionIcon`.
- Producción no cambia. Las fotos de servicios siguen en `src/lib/data/category-images.ts` y los íconos de grupos en `src/lib/data/category-group-visuals.ts`, sin tocar; el módulo los lee. Cuando un nombre se repite, las secciones de negocios (que solo existen en test) se ajustan a producción.
- Alias que quedan para los archivos que ya los importaban, y que delegan al módulo: `DIRECTORY_SECTION_ICONS` (`lib/directory/directory-groups.ts`, reexportado en `directory-nav.tsx`) y `placeVerticalIcon` (`place-photo-placeholder.tsx`). El código nuevo importa del módulo.
- Se borraron `src/lib/directory/section-photos.ts` y `src/lib/data/service-group-photos.ts`; su contenido pasó al módulo.
- Verificación: `node scripts/verify-section-visuals.mjs`. Falla si hay URLs de Unsplash fuera de los archivos de datos, un mapa propio de sección o vertical a ícono, una lectura directa de íconos de grupo fuera de los archivos de producción permitidos, o un nombre con dos fotos o dos íconos.

## Secciones de negocios y variantes

| Clave | Nombre | Foto (id de Unsplash) | Ícono (lucide) |
|---|---|---|---|
| `restaurantes` | Restaurantes | `1517248135467-4c7edcad34c4` | Utensils |
| `cafes` | Cafés y bares | `1495474472287-4d71bcdd2085` | Coffee |
| `cafes:cafeterias` | Cafeterías | `1495474472287-4d71bcdd2085` | Coffee |
| `cafes:bares` | Bares | `1514362545857-3bc16c4c7d1b` | Beer |
| `cafes:postres` | Postres | — (solo ícono) | IceCreamCone |
| `supermercados` | Supermercados | `1542838132-92c53300491e` | ShoppingCart |
| `pulperias` | Pulperías | `1604719312566-8912e9227c6a` | Store |
| `ferreterias` | Ferreterías | `1581783898377-1c85bf937427` | Hammer |
| `farmacias` | Farmacias | `1576602976047-174e57a47881` | Pill |
| `gasolineras` | Gasolineras | `1527018601619-a508a2be00cd` | Fuel |
| `talleres` | Talleres | `1625047509248-ec889cbff17f` | Wrench |
| `bancos` | Bancos y cajeros | `1601597111158-2fceff292cdc` | Landmark |
| `hospedaje` | Hospedaje | `1566073771259-6a8506099945` | BedDouble |
| `hospedaje:hoteles` | Hoteles | `1566073771259-6a8506099945` | Hotel |
| `hospedaje:por-dias` | Casas y apartamentos por días | — (solo ícono) | House |
| `tours` | Tours | `1519046904884-53103b34b206` | Compass |
| `salud` | Salud | `1576765608535-5f04d1e3f289` | Heart |
| `gimnasios` | Gimnasios | `1534438327276-14e5300c3a48` | Dumbbell |
| `veterinarias` | Veterinarias | `1628009368231-7bb7cfcb0def` | PawPrint |
| `belleza` | Belleza | `1560066984-138dadb4c035` | Star |
| `parqueos` | Parqueos | `1470224114660-3f6686c562eb` | SquareParking |
| `lavacar` | Lavacar | `1754296577179-0e14f78a1262` | Droplets |
| `atracciones` | Atracciones | `1432405972618-c60b0225b8f9` | Mountain |
| `tiendas` | Tiendas | `1528698827591-e19ccd7bc23d` | ShoppingBag |
| `centros-comerciales` | Centros comerciales | `1567958451986-2de427a4a0be` | Building2 |
| `mercados-y-carnicerias` | Mercados y carnicerías | `1488459716781-31db52582fe9` | Beef |
| `tramites` | Trámites | `1555848962-6e79363ec58f` | FileText |
| `educacion` | Educación | `1503676260728-1c00da094a0b` | BookOpen |
| `transporte` | Transporte | `1544620347-c4fd4a3d5957` | Bus |

## Grupos de servicios

| Grupo | Nombre | Foto | Ícono |
|---|---|---|---|
| `hogar` | Hogar | `1621905251189-08b45d6a269e` | Armchair |
| `construccion_ingenieria` | Construcción | `1504307651254-35680f356dfd` | HardHat |
| `limpieza` | Limpieza | `1581578731548-c64695cc6952` | Sparkles |
| `salud` | Salud | `1576765608535-5f04d1e3f289` | Heart |
| `bienestar` | Bienestar | `1600334129128-685c5582fd35` | HeartHandshake |
| `belleza` | Belleza | `1560066984-138dadb4c035` | Star |
| `moda_y_cuidado_personal` | Moda | `1528698827591-e19ccd7bc23d` | Shirt |
| `automotriz` | Vehículos | `1625047509248-ec889cbff17f` | Car |
| `tecnologia` | Tecnología | `1518770660439-4636190af475` | Laptop |
| `profesional` | Empresas | `1554224155-6726b3ff858f` | Briefcase |
| `comercios` | Comercios | `1577219491135-ce391730fb2c` | Store |
| `creatividad` | Creatividad | `1626785774573-4b799315345d` | Palette |
| `eventos` | Eventos | `1633330977020-2bdfb8530cc2` | CalendarDays |
| `educacion` | Educación | `1503676260728-1c00da094a0b` | BookOpen |
| `agricultura` | Agro | `1416879595882-3373a0480b5b` | Wheat |
| `turismo` | Turismo | `1519046904884-53103b34b206` | Map |
| `mascotas` | Mascotas | `1628009368231-7bb7cfcb0def` | PawPrint |


Servicios: cada servicio usa su foto de `category-images.ts` (por ejemplo, Mecánica `1625047509248-ec889cbff17f`) y el ícono de su grupo (`categoryIcon`). Los servicios que repiten una sección de negocios (`SERVICE_MENU_HIDE`: restaurantes_comida, cafeterias, farmacias, gasolineras, supermercados_minisuper y ahora ferreterias) no salen en los menús con el directorio encendido. En `/servicios` de producción conservan el ícono de su grupo.

## Desviaciones encontradas y corregidas (2026-11-27)

1. Talleres tenía su propia foto (`1487754180451`) y el servicio Mecánica otra (`1625047509248`). Ahora Talleres usa la de Mecánica.
2. Belleza, Salud y Educación tenían dos íconos y dos fotos según la pestaña. En Servicios se veían Star, Heart y BookOpen (producción); en Negocios, Scissors, Stethoscope y GraduationCap, con otras fotos (clínica y graduación). Ahora Negocios usa el ícono de producción y la misma foto que el grupo (peluquería, enfermería y tutorías).
3. `placeVerticalIcon` tenía su propio mapa: Restaurantes con UtensilsCrossed (en lugar de Utensils), Tours con MapPinned (en lugar de Compass), Belleza con Scissors y Salud con Stethoscope. Ese mapa alimenta HeroTile (respaldo de `/categorias`, sucursales, avatar de `/marca`) y el avatar de la ficha del negocio. Ahora sale de la sección.
4. "Lo más buscado" (`servicios-por-seccion.tsx`, rama de negocios): las fichas de negocios eran un degradado con ícono (HeroTile) y no la foto de la sección que se ve en "Categorías más buscadas" y en `/categorias`. Ahora muestran la foto de la sección. Hoy ese bloque no se muestra en la portada con el directorio encendido; la rama queda corregida por si vuelve.
5. `serviceGroupPhoto` daba otra foto a Turismo y Moda en `/categorias`, porque recibía la lista de servicios del grupo, que en la portada no llega. Ahora es una sola foto por grupo.
6. "Más categorías" (`more-categories.tsx`) tenía sus propios dibujos: Hotel para Hoteles y Hammer para Hogar (producción usa Armchair), además de un dibujo propio por servicio (Calculator, Zap, Scissors, Flower2, Sparkles). Ahora los lugares usan la sección o variante y los servicios el ícono de su grupo.
7. `/solicitudes` (`projects-hub.tsx`) dibujaba cada oficio con su propio ícono: Plomeros con Droplets, el mismo de Lavacar; Mudanzas con Truck; Electricistas con Plug. Ahora usa `categoryIcon`, y "Mantenimiento del hogar" usa el ícono de Hogar, igual que en "Más categorías". Las tarjetas de ideas del carrusel ("Renueve su cocina", "Mejore la fachada"…) son ilustraciones de la idea, no de la categoría, y conservan su dibujo.
8. `app-home.tsx` y `search-entry.tsx` (pantallas del app sin uso por ahora) tenían íconos propios: Plomeros Droplets, Mudanzas Truck, Limpieza Sparkles y Utensils suelto. Ahora usan el módulo.
9. `/precios` dibujaba Pill, ShoppingCart y Fuel sueltos. Ahora usa `sectionIcon("farmacias" | "supermercados" | "gasolineras")`.
10. Hoja de búsqueda, sugerencias, cajón "Negocios", "Más categorías", `/solicitudes` y el avatar del negocio sin foto pintaban el ícono con tres tintes planos (#eaf7fd, #EBF5FB, #eef8fc) y un dibujo celeste, con esquinas redondeadas o en círculo, o sin fondo. Ahora todos usan `SectionIcon`/`CategoryIcon`/`IconBadge` con el círculo mejorado de producción. "Busque en su provincia" y `/precios` conservan el dibujo suelto dentro de su chip o botón, pero el dibujo sale del módulo.
11. Ferreterías: el servicio "Ferreterías" (Store, grupo Comercios) y la sección "Ferreterías" (Hammer) tenían el mismo nombre. El servicio ya no sale en los menús con el directorio encendido, igual que farmacias y gasolineras.

## Lo que se dejó igual, y por qué

- Hero de computadora (`landing-hero.tsx`): son las fotos de campaña de producción (liniero, fontanero, carpintería), no fichas de categoría. Con el directorio encendido, su titular por categoría solo se muestra en teléfono, y ahí el hero es `HomeHeroSlides`, que ya usa `categoryPhoto` y `sectionPhoto`.
- `ServiceImage`, `category-group-picker`, `projects-board` y el menú de escritorio del navbar leen los datos de producción directamente, así que el resultado ya es el mismo. Se dejan así para no tocar producción.
- La gama de colores del degradado de HeroTile (`biz-ui.tsx`, `HUES`) no es foto ni ícono. El dibujo dentro del degradado sí sale del módulo.
- Ícono de "arreglar" en la búsqueda del app (Wrench): es una acción del asistente, no la sección Talleres.
- Fichas con foto real del negocio ("Mejor calificados", similares, resultados): solo fotos reales del negocio; sin foto, la tarjeta es de texto (regla del 2026-11-27). No se usan fotos de sección como relleno.
- Imágenes OG: ninguna usa foto ni ícono de sección.
