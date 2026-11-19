# Recordatorios de citas: alcance local

Implementación en preparación, exclusivamente en `local/pro-suite-no-push`. No acredita disponibilidad en producción, push móvil ni equivalencia completa con Houzz Pro.

## Uso previsto

En las opciones secundarias de Citas, cada persona puede activar «Recordarme mis citas / Remind me about my appointments». La preferencia es independiente de la disponibilidad pública del profesional. Un aviso dentro de ContrataCR recuerda una cita confirmada 24 horas antes; no incluye nombres, direcciones ni notas. El enlace abre la cita correspondiente según el destinatario y el idioma.

Las cuentas preexistentes quedan desactivadas. La habilitación técnica local por propietario y la preferencia personal deben existir antes del vencimiento del recordatorio; no se envían avisos atrasados al activar. El proceso acepta una demora de hasta 15 minutos. Una propuesta de reprogramación pendiente mantiene el horario acordado; un cambio aceptado, cancelación o finalización invalida el aviso anterior sin borrar el historial.

## Ejecutor

`node scripts/pro/run-appointment-reminders-local.mjs` procesa una tanda local. `--watch` repite cada minuto, hasta detener el proceso. No instala un servicio ni se inicia automáticamente. `--as-of=2026-11-10T16:00:00Z` permite una única ejecución con reloj controlado para datos ficticios; no es compatible con `--watch`.

El ejecutor lee únicamente `.env.test`, exige Supabase `http://127.0.0.1:54321`, rechaza redirecciones y no imprime credenciales. La ruta pública de preferencias no admite un reloj ni un identificador de otra persona. El SQL debe estar instalado y verificado antes de ejecutar; nunca usar producción para probar este bloque.

El outbox local debe terminar suprimido, con cero intentos y entregas. No interpretar `pushDelivery:false` del resumen del ejecutor como prueba de entrega: la evidencia es la verificación independiente de outbox/recibos y transporte.

## Registro de validación (cronológico)

- SQL aislado: reloj, permisos, idempotencia, invalidez, concurrencia, preservación y outbox.
- Instalación local acotada con respaldo y comparación de datos existentes.
- API e interfaz ES/EN: preferencias personales, conflicto de revisión y respuesta perdida.
- Prueba del ejecutor real contra datos ficticios, revisión visual móvil/escritorio y simulador.

Textos y enlaces: 11 pruebas puras aprobadas (cuatro de recordatorios y siete de avisos existentes). No necesitan usuarios ni navegador; la configuración general intentó primero exigir fixtures ajenos, por lo que se ejecutaron con `E2E_FIXTURES_READY=0`, sin sembrar datos ni modificar aserciones.

Primera verificación SQL aislada aprobada: `/tmp/pro-appointment-reminders-isolated.log`. Incluye esquemas y triggers reales de Pro y outbox, idempotencia, límites temporales, invalidez e historial. Su motor serializa conexiones: no acredita concurrencia real. La revisión independiente detectó inversión de bloqueos entre actualización directa de trabajo y ejecutor, además de una carrera con suspensión de cuenta; ambas deben corregirse y probarse antes de instalar. El primer fallo del verificador fue un valor de enum inválido en el fixture de membresía; se corrigió el fixture a una fecha de expiración pasada, sin debilitar aserciones.

Instalación local verificada del SQL `d09e5ef187f7e9e0e1518335a278e4d67e4afa17490dbfb1d18ac46093aae46b`: veinte tablas existentes idénticas antes/después y cuatro tablas nuevas vacías, `/tmp/pro-reminders-install.log`. No cuentas preexistentes activadas. Se corrigieron los bloqueos señalados y el verificador aislado volvió a aprobar, incluyendo UTC/CR/Tokio y rollback de invalidación.

Primeros cinco casos PostgreSQL real aprobados en `/tmp/pro-reminders-concurrency.log`: runners simultáneos sin duplicado, rollback, opt-out concurrente, actualización directa de trabajo sin deadlock y suspensión concurrente revalidada. Fixtures propios eliminados al terminar. Aún pendientes casos cruzados entre propietarios, reprogramación concurrente, prueba API/interfaz y ejecutor CLI real. No equivalencia completa ni disponibilidad en producción.

Concurrencia PostgreSQL real cerrada con **siete casos aprobados**, `/tmp/pro-reminders-concurrency-final.log`: se añadieron proveedores que también son clientes entre sí (dos ejecutores con límites distintos) y aceptación real de reprogramación mientras otro ejecutor esperaba. Sin duplicados ni deadlocks; revalidación del horario antes de insertar. Cero intentos/entregas y limpieza de todas las sesiones y fixtures comprobada por IDs. Pruebas API/UI/CLI y revisión visual continúan pendientes; fuentes congeladas para esa fase.

Prueba integral WebKit: ES aprobada en `/tmp/pro-reminders-webkit-final.log`. Incluye controles API, preferencias independientes, respuesta perdida seguida de 401/409 y recarga manteniendo identidad, ejecutor CLI real (dos avisos y replay sin duplicados), enlaces al detalle y regreso a Notificaciones, lectura persistente y cancelación que invalida sin borrar. EN recorrió esas acciones pero falló la aserción final de cero errores de página: WebKit reportó access-control checks en peticiones de direct-chat/notificaciones durante navegación/recarga. EN no se declara aprobado; revisión del trace y reintento focal pendientes. No se filtran errores ni se debilitan aserciones.

Primera ejecución conservada en `/tmp/pro-reminders-webkit.log`: ES agotó navegación fría a Notificaciones; EN rechazó correctamente una cancelación ficticia sin el campo note requerido. Se corrigió únicamente ese input de prueba, no la API. Las capturas móviles de preferencias ES/EN fueron revisadas directamente, sin desbordamientos visibles. Escritorio y dos regresiones dependientes todavía pendientes. El simulador sigue reportando Mac bloqueado; no se hace pasar el navegador automatizado por prueba manual.

Actualización de validación: WebKit EN aprobó el reintento aislado con la aserción de cero errores intacta (`/tmp/pro-reminders-webkit-en-quiet.log`); Chromium escritorio ES/EN aprobó 2/2 (`/tmp/pro-reminders-desktop-retained.log`). Cotización → aceptación → trabajo EN aprobada (`/tmp/pro-reminders-ordinary-en.log`), contrato estático de marca y tres navegadores aprobados (`/tmp/pro-reminders-retention-brand.log`). Evidencia visual revisada a 390 y 1366 px; no acredita aún toda la matriz de tamaños ni el simulador nativo.

La configuración de desarrollo conserva módulos durante 15 minutos y 20 entradas únicamente con Supabase loopback exacto, para reducir recompilaciones entre recorridos. Se verificó que no aplica a producción ni a un backend remoto; los resultados posteriores no demuestran por sí solos que esa fuera la única causa de los fallos anteriores.

Pendiente real: la regresión existente de Citas detectó que «Disponibilidad pública» se cierra al remontarse el panel durante el recorrido del cliente (`/tmp/pro-reminders-appointments-retained.log`). Guardado e historial correctos; la aserción no se ha debilitado ni se reabre el control artificialmente. Investigación en curso. El nuevo intento de acceso manual al simulador volvió a reportar el Mac bloqueado.

Regresión de Citas cerrada en servidor sin ediciones concurrentes: aprobó en 31,1 s (`/tmp/pro-appointments-hmr-audit.log`), conservando las aserciones de disponibilidad abierta, respuesta perdida, duración de 120 minutos, pausa, confirmación y cancelación. No se cambió producto ni se añadió reapertura artificial del desplegable. Las trazas previas tenían navegaciones completas no solicitadas por el test; la recarga del entorno de desarrollo es una hipótesis, no una causa demostrada retrospectivamente. Instrumentación diagnóstica temporal retirada después de revisar su resultado.
