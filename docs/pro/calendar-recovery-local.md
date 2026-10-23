# Calendario Pro y reservas — recuperación local

Estado: desarrollo local; no enviado a ramas remotas, producción ni tiendas.

## Procedencia del diseño

Se consultó `5590123a^`, antes de la eliminación de Citas del 8 de octubre de 2026:

- `src/components/booking/booking-modal.tsx`: mes de lunes a domingo, días circulares, selección cian, puntos de disponibilidad y selección de hora.
- `src/components/professionals/professional-schedule.tsx`: tres columnas compactas de días y horas en los resultados, navegación y acceso al calendario completo.
- `src/components/dashboard/pro/availability-editor.tsx`: edición de disponibilidad por fecha.

Se reutiliza ese lenguaje visual y recorrido con los componentes compartidos actuales. No se reactivaron las antiguas rutas y permisos globales de Citas: Pro continúa solo local.

## Conexión real

- Pro es una capacidad de una cuenta profesional; administradores conservan acceso Pro.
- Una cuenta gratuita autenticada puede reservar; no necesita membresía Pro.
- Agenda permite publicar/quitar horarios concretos por fecha y duración.
- La tarjeta y ficha consultan horarios públicos al entrar en pantalla; únicamente se devuelven horas disponibles.
- Confirmar crea/vincula el cliente y una cita `scheduled` en el mismo documento de negocio del profesional. Clientes y cotizaciones existentes se conservan.
- Reservar y editar la agenda comparten la revisión y bloqueo transaccional de `pro_save_workspace`. Dos solicitudes simultáneas no pueden reservar el mismo intervalo ni sobreescribir cambios.
- Se protege la identidad del cliente asociado a la reserva al editar una cita. Cancelar mantiene el historial y libera el intervalo si el horario sigue publicado.
- Los reintentos conservan un UUID para no duplicar una confirmación que ya llegó al servidor.
- La agenda revalida al recuperar foco y cada 30 segundos mientras está visible y sin formularios abiertos. No recarga la página ni reemplaza cambios en curso.

## Límites deliberados de esta etapa

No hay despliegue, cobros ni comunicaciones a clientes reales. Esta implementación publica horarios por día; no restaura todavía las antiguas plantillas semanales recurrentes, la gestión de sedes/videoconsulta ni los recordatorios externos. Tampoco incluye todavía una sección de historial/cancelación del lado del cliente. La confirmación aparece al reservar y la gestión queda en la agenda del profesional. Estos recorridos deberán completarse antes de lanzar reservas al público.

## Pruebas

El nuevo recorrido E2E usa Supabase local y cuentas desechables reales, no respuestas simuladas: reserva desde ficha con cliente gratuito, reflejo en agenda, idempotencia, conflictos concurrentes, autenticación, origen, autorreserva bloqueada, consulta pública sin datos de clientes y desactivación al perder Pro. Se ejecuta en WebKit móvil, Chromium móvil y Chromium escritorio junto con las pruebas Pro anteriores. Los resultados finales se registran al terminar la ronda.

### Resultado de la ronda del 23 de octubre de 2026

- Suite Pro completa: **51/51 aprobadas**, WebKit móvil, Chromium escritorio y Chromium móvil; 3,6 minutos. Log `/tmp/pro-calendar-final.log`.
- Tras ajustar el ancho del selector de fecha en iPhone, repetición del recorrido completo de reservas: **3/3 aprobadas**. Incluye edición de disponibilidad sin desbordamiento. Log `/tmp/pro-calendar-visual-final.log`.
- TypeScript sin errores: `/tmp/pro-calendar-final-tsc.log`.
- ESLint del código de Pro y reservas modificado: sin errores ni advertencias, `/tmp/pro-calendar-final-lint.log`. El archivo preexistente `professional-schedule.tsx` conserva dos advertencias de hooks anteriores a estos cambios.
- Simulador iPhone 17 Pro / iOS 26.5: cuenta local Isaac Sánchez Monge, calendario dentro de Mi panel → Agenda; horarios de búsqueda del perfil ficticio Redes Bahía; selección de fecha/hora y confirmación real contra Supabase local. Se comprobó que la cita quedó persistida con el identificador de la cuenta local.
- Evidencias: `/tmp/contratacr-pro-calendario-restaurado-iphone.png`, `/tmp/contratacr-pro-horarios-busqueda-iphone.png`, `/tmp/contratacr-pro-reserva-calendario-iphone.png`, `/tmp/contratacr-pro-reserva-confirmada-iphone.png`, `/tmp/contratacr-pro-disponibilidad-corregida-iphone.png`.
- No se alteró ninguna base remota ni se enviaron correos, publicaciones o notificaciones a personas reales. La reserva creada en el simulador pertenece a fixtures locales.
