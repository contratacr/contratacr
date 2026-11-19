# Formularios de cambios del trabajo — 7 de noviembre de 2026

Solo Pro, `local/pro-suite-no-push`, HEAD `06b70019`. Sin commits/push, producción, migraciones ni modificaciones a datos existentes.

## Cambios

- Proponer extra/cambio y registrar aprobación: pie fijo compartido con Cancelar antes de Guardar/Registrar o reintentar. Botón submit asociado al formulario mediante id.
- Etiquetas consistentes, contenido de campos con peso normal, borde gris del catálogo visual existente.
- La prueba manual detectó que descartar podía exigir un segundo Cancelar: se sincronizan el estado limpio del editor y el estado del padre antes de navegar hacia atrás. No se omiten bloqueos por guardado incierto.

## Pruebas

`pro-work-changes.spec.ts` y `pro-work-changes-english.spec.ts`: 2/2 aprobadas en WebKit móvil (`/tmp/pro-change-discard-verified.log`, 53.7 s). Incluyen Cancelar→Seguir editando conserva texto, Cancelar→Descartar cierra con una confirmación, reabrir vacío, guardado incierto/reintento sin duplicar, aceptación del cliente, permisos, cambios obsoletos y conservación de pagos, cliente y borrador anterior. Fixtures profesionales con rol/perfil/metadatos coherentes.

Revisión manual real en Simulator iPhone 17 Pro iOS 26.5, Safari normal, servidor 127.0.0.1:3185:
- Español: motivo escrito, orden de campos/acciones, Cancelar→Seguir editando conserva texto; se descarta sin guardar propuesta.
- Inglés: añadir concepto, desplazar contenido, verificar pie fijo y etiquetas, cancelar/descartar. Tras corregir cierre, se repite con una sola confirmación y se observa regreso al detalle del trabajo.
- Se usa fixture separada «QA cambios de trabajo local» (trabajo 7eecd87c-a178-43b5-ab61-30e267a6d478), cliente ficticio separado y acuerdo ficticio de ₡1.000; permanece local para revisión. No se alteró el acuerdo del trabajo existente. No se guardaron propuestas manuales ni se enviaron mensajes.
- Registrar aprobación comparte el componente corregido; no se certifica una aprobación manual en Simulator.

ESLint focal, TypeScript y git diff --check aprobados. No cambios en headers/marca. Los primeros intentos de test tuvieron una colisión de nombre de variable en la fixture y un selector de diálogo incorrecto; se corrigieron sin retirar aserciones.
