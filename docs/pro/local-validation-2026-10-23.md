# Validación local de Pro — 23 de octubre de 2026

Entorno: rama local/pro-suite-no-push, servidor Webpack 127.0.0.1:3185 y Supabase nativo 127.0.0.1:54321. No se aplicaron cambios a Supabase remoto, tiendas, redes ni ramas publicadas.

## Resultado final

- Suite local Pro: **48/48 aprobadas**, 3.1 minutos, sin omisiones. Log local: /tmp/pro-final-48.log; evidencias: /tmp/pro-final-48.
- Plataformas de navegador: Chromium escritorio, Chromium móvil y WebKit móvil.
- TypeScript sin emisión: aprobado. ESLint de componentes Pro, lógica Pro, APIs Pro/admin Pro, editor/lista de cotizaciones y pruebas Pro: aprobado. No equivale a ejecutar toda la suite histórica del repositorio.
- git diff --check: aprobado.
- CSV comprobado adicionalmente: BOM UTF-8, comillas y neutralización de fórmulas.

## Recorridos comprobados

- Administrador real local con MFA, asignación Pro sin cambiar roles y rechazo de clientes sin perfil profesional.
- Clientes: crear, persistir, búsqueda, bloques visuales de 20 y ficha con historial.
- Cliente → nueva cotización: selección/nombre/correo prellenados.
- Una lista de cotizaciones con registros anteriores y documentos normales; selector de inventario sin duplicar IVA.
- Fallo de vinculación después de crear: reintento sin crear dos cotizaciones.
- Cotización enviada: el servidor rechaza agendarla como aceptada. Aceptada: conserva IDs de cliente/cotización al agendar.
- Borrador de cita sobrevive a recarga con sesión activa; historial muestra documento y cita.
- Inventario: guardar, entrada/salida, conservación de historial y rechazo de existencias negativas.
- Aislamiento entre cuentas, escrituras directas/RPC restringidas y conflictos de revisión.
- Difusión mensual: revisión previa, reserva del cupo, rechazo de duplicados y aprobación administrativa, sin publicación externa.
- Pantallas en inglés y comprobaciones de desbordamiento.
- Profesional sin Pro: mantiene su editor/cotizaciones y no recibe controles Pro.

## Revisión manual del simulador

App com.contratacr.app en iPhone 17 Pro, iOS 26.5, apuntando al servidor local. Sesión persistida de **Isaac Sánchez Monge · Local**, cuenta exclusivamente local con permisos admin/profesional y datos ficticios; no es la cuenta de producción.

Se revisaron Mi panel, Agenda, Clientes, historial, cotizaciones, cliente prellenado y paso desde cotización aceptada a nueva cita. Se ajustaron el ancho nativo de fechas, el selector único de cotización, menús de acciones y bordes. Se comprobó que la sesión persistiera al cerrar/reabrir la instancia de desarrollo.

Capturas locales:
- /tmp/contratacr-pro-agenda-integrada-iphone.png
- /tmp/contratacr-pro-clientes-integrados-iphone.png
- /tmp/contratacr-pro-cliente-historial-iphone.png
- /tmp/contratacr-pro-cotizacion-cliente-iphone.png
- /tmp/contratacr-pro-agendar-desde-cotizacion-iphone.png

No se hizo una prueba física en Android/iPhone ni una nueva compilación firmada. La exportación reutiliza el mecanismo compartido de guardado/hoja nativa; no se verificó una entrega real a Excel en un dispositivo físico.

## Preparación pendiente antes de publicar Pro

- Normalizar almacenamiento y paginación real del servidor; los bloques actuales de 20 limitan el renderizado, no la descarga del documento JSON.
- Planificar migración no destructiva de registros antiguos de cotizaciones; se preservan, no se fingió convertirlos en documentos normales.
- Recordatorios, recurrencia avanzada, reportes contables, pagos/factura electrónica y pruebas físicas corresponden a etapas posteriores.

Las primeras rondas encontraron problemas de observación al desplazar, selectores duplicados y errores temporales de Fast Refresh/caché de desarrollo. Se corrigieron y se repitió la suite; el resultado de arriba corresponde al código final de esta ronda.
