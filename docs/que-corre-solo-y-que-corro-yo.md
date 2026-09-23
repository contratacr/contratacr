# Qué corre solo y qué corrés vos

Guía corta de todo lo automático del repositorio: cuándo se dispara, qué cuida y
cuánto cuesta. La regla de fondo es la misma en todo: lo barato corre solo en
cada push; lo caro (minutos de macOS, emuladores, escrituras a Supabase) se
despacha a mano desde **Actions → el flujo → Run workflow**.

## Corre solo, sin que toqués nada

| Flujo | Cuándo | Qué cuida | Costo |
| --- | --- | --- | --- |
| **Security checks** | cada push a `main` y `test`, y cada PR | lint, build de producción y auditoría de dependencias. Es la red que evita publicar algo que ni compila | ~6 min de Linux |
| **Cloudflare Compatibility** | cada push a `main`, `test` y `mobile` | que el bundle siga cabiendo en Workers y que los secretos del Worker estén completos | ~4 min de Linux |
| **Regression tests** | cada push a `test` | la suite de Playwright contra un Supabase local que el propio flujo levanta. No toca ningún ambiente real | ~15 min de Linux |
| **Mobile Native Regression** | cada push a `mobile` | contratos nativos y las suites de WebView. El emulador de Android y el trabajo de iOS **no** corren aquí | ~8 min de Linux |
| **Migrations drift** | al empujar migraciones a `main`, y todos los días 6:30 a.m. CR | simula las migraciones en test y en producción y avisa si un ambiente quedó atrás | ~2 min |
| **Supabase backup** | todos los días 2:10 a.m. CR | respaldo completo de producción | ~3 min |
| **Regression tests (Safari)** | lunes 5:00 a.m. CR | las pantallas públicas en WebKit, el motor del iPhone | ~8 min de Linux |
| **Push drain** | cada 10 minutos | vacía la cola de avisos push. Si el ambiente no está configurado se salta solo, sin fallar | segundos |

Eso es todo lo recurrente: unos 25 minutos de Linux por push a `test` y un
puñado de minutos diarios. Nada de esto escribe en producción salvo el respaldo
(que solo lee).

## Lo despachás vos, cuando hace falta

| Flujo | Cuándo usarlo | Cuidado |
| --- | --- | --- |
| **Supabase migrations** | para aplicar migraciones nuevas a `test` y luego a `production` | corré siempre primero con `dry_run: true` y leé la lista antes de aplicar |
| **Sync production to test** | cuando querés que test sea una copia fresca de producción para probar a mano | es destructivo en test: pide escribir `SYNC_PRODUCTION_TO_TEST` |
| **Supabase email templates** | al cambiar el diseño de los correos de Auth | tiene `dry_run` |
| **Padrón refresh D1** | cuando sale un padrón nuevo | tiene `dry_run` |
| **Mobile Native Regression** (con `workflow_dispatch`) | antes de subir una versión a las tiendas | ahí sí corre el emulador y el trabajo de macOS: un minuto de macOS cuesta como diez de Linux |
| **Cloudflare Compatibility** en modo `deploy` | cuando querés un Worker de vista previa aislado | deja el preview vivo; borralo al terminar |

## Safari (WebKit), a pedido

Las pruebas corren en Chrome de escritorio y en Chrome móvil en cada push.
Safari corre **solo los lunes a las 5:00 a.m.**, sobre las pantallas públicas
(portada, /buscar, ficha, servicios y la regresión visual): unos minutos de
Linux por semana. Y a mano, cuando querés:

```
PLAYWRIGHT_WEBKIT=1 npx playwright test --project=webkit-mobile
```

Vale la pena antes de publicar algo que toque diseño, precios o gestos: es el
motor del iPhone y de la app nativa. La primera corrida ya encontró un error que
Chrome no podía ver (los precios se escribían distinto en Safari y React
rearmaba la tarjeta entera al hidratar).

## Las dos cuentas con las que se prueba

`e2e.client@contratacr.test` (**Estudio Delta**) y `e2e.pro@contratacr.test`
(**Redes Bahía**) son cuentas **inventadas**. Antes eran copia de dos personas
reales de producción —nombre, foto, teléfono y dirección— y el sembrado salía a
`www.contratacr.com` a leerlas en cada corrida. Ya no: la identidad completa vive
en `scripts/actores-de-regresion.json` y de ahí la leen la siembra, la
verificación y las pruebas. Si cambiás un nombre o un slug ahí, cambia en todo el
repositorio.

Entre las dos tienen de todo para revisar el app a mano: solicitudes en los seis
estados, proyectos, conversaciones, empleos,
ofertas, tiquetes de soporte, reseñas, favoritos y notificaciones. Para
rearmarlas:

```
npm run seed:test:full     # limpia y siembra la pareja completa
npm run seed:test:verify   # confirma que no falte nada
```

## Cuánto cuesta al mes, en números redondos

- Push a `test`: ~25 min de Linux (seguridad + compatibilidad + regresión).
- Push a `main`: ~10 min (no corre la regresión; ya pasó en `test`).
- Diario: ~6 min entre respaldo y control de migraciones.
- La cola de push: 144 corridas de segundos al día; se salta sola si no hay nada.

Con el ritmo de un bloque de trabajo por día, eso son unas 20 horas de Linux al
mes, dentro de lo gratuito de GitHub para un repositorio público. Lo que sí se
paga por minuto es macOS, y por eso el trabajo de iOS **nunca** corre solo.

## Lo mínimo que conviene correr antes de publicar

1. `npx tsc --noEmit` — no cuesta nada y atrapa la mayoría.
2. La suite que cubre lo que tocaste, no todas.
3. Si tocaste diseño o precios: la misma suite con `PLAYWRIGHT_WEBKIT=1`.
4. Empujar a `test` y dejar que Security checks y Regression tests confirmen.
