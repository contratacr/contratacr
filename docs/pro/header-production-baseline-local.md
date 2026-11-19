# Encabezados: base de main y extensiones Pro

## Alcance local

Revisión sobre HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`, rama
`local/pro-suite-no-push`, conservando sus cambios previos. Referencia de código:
`main` local `ae2343a0` (no equivale a verificar el despliegue activo).
Sin checkout, merge, push, cambios en main/mobile ni operaciones en producción.

Se recuperan de esa referencia únicamente `SectionBrand`, las constantes de
cabecera (título de 19px) y las medidas del menú móvil. El panel reutiliza esas
constantes también en sus cabeceras de respaldo y escritorio. Las nuevas
secciones, navegación con historial y formularios de Pro permanecen.

## Campana

La app nativa ya excluye sus atajos globales de las pantallas internas; Safari
móvil usaba otra condición y seguía mostrando la campana. La cabecera web móvil
ahora conserva notificaciones en las pantallas raíz y las oculta en las internas
con flecha, además de respetar formularios y menús contextuales. No se modifica
la campana de escritorio ni el contenido o entrega de notificaciones.

Esto es una adaptación deliberada de la web móvil al recorrido móvil solicitado,
no una afirmación de que el JSX sea idéntico a main. No se copiaron pantallas
completas ni se revirtieron funciones de Pro.

## Selección de pruebas

Cambio compartido de navegación/layout: contrato de marca sin fuentes en
Chromium escritorio, Chromium móvil y WebKit móvil; matriz del panel ES/EN en
móvil (home, citas, cotizaciones, clientes, herramientas, inventario, gastos,
citas del cliente y perfil); regresión de historial de Pro en WebKit. Cuentas
desechables exclusivamente en Supabase local, con limpieza propia. Las pruebas
del panel verifican que documento/revisión previos no cambien y no se creen
notificaciones. No se ejecutan pruebas fiscales ni migraciones: no cambian.

La revisión visual usa capturas de navegadores móviles automatizados; no debe
presentarse como una prueba física ni como una auditoría completa de producción.

Validación estática: contrato de marca y TypeScript correctos. ESLint mantiene
los mismos cuatro errores y dos avisos que ya existen en HEAD de
`landing-navbar.tsx` (immutability, set-state-in-effect, unused-vars y dependencias
de hooks), fuera de las líneas cambiadas; no se desactivaron reglas.

## Resultados

- Marca: 3/3, WebKit móvil y Chromium móvil/escritorio,
  `/tmp/pro-header-final.log`. Dos casos exclusivos de móvil se omiten
  expresamente en escritorio.
- Cabeceras ES/EN: matriz inicial 4/4; las capturas finales de WebKit añaden
  espera de carga y botones habilitados, 2/2 (`/tmp/pro-header-loaded.log`).
- Historial de Pro: 2/2 (`/tmp/pro-header-navigation.log`), incluyendo edición,
  recarga, atrás/adelante y conservación del origen.
- TypeScript y lint de panel/componentes nuevos sin errores. Lint de navbar
  contrastado con HEAD: los mismos hallazgos previos, sin nuevos.
- Capturas revisadas en `research/2026-11-07/header-baseline/`.
- URL LAN responde 200. Ninguna migración ni modificación de datos reales.

La primera ejecución no llegó a las pruebas por requerir fixtures globales
que estos casos no usan. Se ejecutaron con fixtures propias y aisladas. Otro
intento fue interrumpido tras una recarga de desarrollo; la ejecución estable
posterior completó marca y matriz. No se debilitaron aserciones.
