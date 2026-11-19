# Acciones de formularios — 7 de noviembre de 2026

Checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019`. Sin push/commits ni cambios en producción, API, migraciones o datos existentes.

- Propuesta inicial de cita y reprogramación: Cancelar antes de Guardar/Enviar; mismos callbacks y protecciones.
- Complementos de cotización: Cancelar antes de Guardar; cantidad y precio en una columna móvil, alineados en pantallas amplias.
- Horas/gastos del trabajo: Cancelar en pie fijo antes de Guardar, con confirmación de descarte y bloqueo por guardado incierto. Horas/minutos en una columna móvil.

Selección de pruebas: bandeja de citas ES/EN ampliada para inspeccionar formularios de propuesta/reprogramación sin alterar solicitudes; contrato completo de reprogramación; complementos con inspección en inglés y recorrido de guardado/aceptación en español; costos ES/EN con comprobación de Cancelar→Seguir editando y datos conservados. Se hacen coherentes las fixtures profesionales de estos tests (rol/perfil/metadatos), sin modificar usuarios existentes. TypeScript y ESLint focal; no cambios en headers/marca.

La primera tanda en `/tmp/pro-remaining-forms-tests.log` incluye fallos iniciales de carga del servidor de desarrollo; conservar logs y resultados separados. No se rebajan aserciones. Las capturas WebKit móvil no certifican uso físico ni paridad total con producción.

Resultado final: 6 casos focalizados aprobados, reutilizando evidencia compatible: reprogramación y costos EN en `/tmp/pro-remaining-forms-tests.log`; costos ES en `/tmp/pro-remaining-forms-recovery.log`; bandeja ES/EN y complementos en `/tmp/pro-remaining-forms-verified.log` (3/3). La prueba bilingüe de complementos ahora restaura explícitamente NEXT_LOCALE=es antes de volver al recorrido español; no se cambió el middleware ni se redujeron aserciones. Después de reiniciar únicamente el servidor local de desarrollo, la bandeja pasó en ambos idiomas. Base local sin reset.

Capturas revisadas en WebKit móvil, guardadas en `research/2026-11-07/remaining-form-actions`. Validación automatizada móvil, no prueba manual en el simulador nativo. ESLint focal aprobado.
TypeScript (`tsc --noEmit`) y `git diff --check` aprobados.
