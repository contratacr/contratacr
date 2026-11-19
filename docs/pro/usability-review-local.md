# Revisión de facilidad de uso de Pro

26 octubre2026. Solo Pro, rama `local/pro-suite-no-push`, HEAD
`06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se preserva todo el trabajo local
previo. Sin push, cambios a main/mobile, migraciones ni comunicaciones reales.

## Decisiones

- Una acción principal por sección: Nuevo cliente/producto/cita. Importar CSV y
  exportar se reúnen en Más opciones de la sección, junto al botón principal.
  La importación sigue disponible con una lista vacía y conserva su revisión
  previa, plantilla y guardado explícito.
- Inventario mantiene la utilidad de encontrar qué reponer. Un selector Mostrar
  productos reemplaza tres pastillas: Activos, Por reponer y Archivados. Por
  reponer conserva la regla existente stock<=mínimo, solo productos activos;
  cada resultado muestra existencias y mínimo. No se inventan conteos globales
  a partir de las primeras20 filas ni se descargan documentos completos.
- Calendario describe la vista que realmente contiene mes y día elegido.
  Próximas conserva su significado de citas pendientes futuras/en curso. No son
  estados de la cita. Búsqueda sin resultados tiene recuperación explícita.
- Clientes conserva sus dos estados útiles. Cotizaciones mantiene búsqueda y un
  único estado, ya comprobados, para evitar cambios sin un problema observado.
- La ficha vacía de la captura corresponde a un estado posible del código:
  detalle por ID termina antes de lista y esta sustituye los datos por página1.
  Se conserva un registro de contexto separado de IDs visibles y se agregan
  título, carga, error, reintento y Editar desactivado si no hay ficha válida.
  Agenda también carga contexto al abrir una ficha para conservarla al refrescar.

## Selección de pruebas

Entradas modificadas: componentes Pro de lista/ficha/importación y mensajes;
API, SQL, permisos, autenticación, esquema, dependencias y configuración intactos.
Se reutiliza evidencia previa de normalización, RLS y acceso con entradas iguales.
Se seleccionan nuevo recorrido de usabilidad, panel UX, catálogo con exportación,
historia de cliente, movimientos, agenda y selector, e importación (incluido su
harness). Tres motores para los recorridos afectados; sin repetir toda la suite
Pro ni pruebas físicas/tiendas. TypeScript, ESLint focal, bilingüe/UTF-8 y
comparación de datos originales cierran el cambio. No se debilitan aserciones.

## Resultado

-27/27 casos seleccionados aprobados en4,3minutos. WebKit móvil, Chromium
 escritorio y Chromium móvil; sin skips. `/tmp/pro-usability-selected.log` y
 `/tmp/pro-usability-selected` contienen la evidencia.
- El nuevo recorrido fuerza detalle antes de página1, comprueba que la ficha
 fuera de página no desaparece, simula503 y reintenta el mismo ID. Además cambia
 el registro en base entre detalle y lista: la ficha antigua queda no editable
 hasta recuperar datos actuales. Conserva el cambio remoto. No escribe sobre
 datos reales: usa cuentas desechables de Supabase loopback.
- La revisión independiente encontró riesgo de acreditar contexto antiguo con
 una revisión nueva y una carrera en detalle de agenda. Se corrigieron con
 revisión por registro de contexto, invalidación conservadora, bloqueo de
 guardado obsoleto y secuencia de petición. Segunda revisión sin P1/P2 específicos.
- Primeros intentos focales detectaron compilación fría del guard de sesión,
 conteo del test que incluía llamadas de historia y preferencia de idioma después
 de visitar inglés. Se precalentaron rutas reales, se acotó el contador a detalle
 y se ordenó el recorrido ES/EN, sin quitar aserciones ni cambiar seguridad.
- TypeScript y ESLint focal sin errores. Logs `/tmp/pro-usability-tsc-final.log`
 y `/tmp/pro-usability-lint-final.log`. UTF-8, bilingüe427/65 archivos, privacidad
 de env y diffcheck aprobados.
- Comparación exacta final de documentos y revisiones de las dos cuentas
 conservadas:11 trabajos,10 cotizaciones heredadas,50 disponibilidades,
46 clientes,45 productos y10 movimientos intactos. Sin arrays de entidades
 normalizadas en core. No se repitieron migraciones ni verificadores SQL porque
 sus entradas no cambiaron.
- Simulador iPhone17Pro/iOS26.5: menú importar/exportar, importación, selector
 nativo Por reponer y explicación, ficha de producto y cierre a su lista,
 Calendario/Próximas y enlace directo a cliente35 fuera de página1 revisados
 visualmente; la ficha conserva título, notas, acciones e historial. No se importaron archivos ni guardaron
 cambios en esa cuenta durante la revisión.
- Capturas locales: `/tmp/contratacr-pro-usabilidad-inventario-20261026.png`,
 `/tmp/contratacr-pro-usabilidad-importar-20261026.png`,
 `/tmp/contratacr-pro-usabilidad-reponer-20261026.png` y
 `/tmp/contratacr-pro-usabilidad-agenda-20261026.png` y
 `/tmp/contratacr-pro-usabilidad-ficha-20261026.png`.

Todo permanece sin commit ni push sobre el mismo HEAD. Main/mobile intactos.
Esta ronda mejora cuatro módulos existentes; no declara completadas integraciones
fiscales, pagos ni el lanzamiento comercial.
