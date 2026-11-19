# Cierre visual y navegación local

HEAD06b70019, local/pro-suite-no-push, 460 cambios/archivos previos conservados. Solo Pro; main como referencia de lectura. Sin push ni producción.

## Selección de evidencia

Se reutiliza la última ronda funcional: 16 casos distintos aprobados de catálogo, organizaciones, gastos, recuperación persistente de pagos, formularios, tarjetas, proyectos y solicitudes hasta trabajo terminado, y menú de herramientas/perfil. No se repite esa suite para una auditoría visual sin cambios funcionales.

Se actualizan pro-header-parity, pro-section-scroll y pro-native-section-scroll porque aún intentaban abrir Clientes/Cotizaciones directamente desde la raíz, mientras el recorrido acordado está dentro de Herramientas. Perfil y metadata de fixtures se hacen coherentes como profesionales. Se incluyen productos, gastos, pagos y estadísticas; origen al volver es Herramientas para enlaces internos. Scroll en viewport compacto real de640px, con precondición de scroll positivo y activación por evento para no dejar que Playwright desplace primero el botón. Se verifica cero scroll al entrar y volver, historial correcto, documento/revisión originales y ausencia de notificaciones nuevas. La simulación nativa no certifica un binario instalado.

No cambian marca ni cabeceras de producto en esta etapa: no corresponde repetir marca/tres navegadores salvo que un hallazgo lleve a modificarlas. La matriz ES/EN de seis casos WebKit sí cubre navegación y cabeceras actuales.

## Simulador

Intento inicial: Mac bloqueado. Se solicitó desbloqueo manual y se continuó auditoría independiente. No se declara recorrido manual completado hasta observarlo.

## Resultado posterior del 8 de noviembre

El usuario desbloqueó el Mac y el simulador respondió. Se observaron Gastos en inglés, regreso a Mi panel con ficha de perfil, Herramientas sin campana y Estadísticas. No se guardaron registros en ese recorrido; el flujo completo sigue pendiente. Se prepararon dos cuentas ficticias nuevas locales para separar las pruebas de los datos existentes.

La auditoría sí encontró defectos en la carga del panel: Herramientas quedaba vacío mientras cargaba el acceso, algunas pantallas inglesas mostraban texto español y el título podía cambiar al resolver permisos. Se corrigieron con un placeholder y títulos estables sin conceder acceso antes de verificarlo.

Evidencia: cabeceras ES/EN aprobadas en `/tmp/pro-final-review.log`; carga demorada y scroll web/nativo simulado ES/EN, seis casos, aprobados en `/tmp/pro-final-review-verified.log`. Ocho casos distintos agregados, no ocho más seis. Se conserva la aserción de scroll de ventana y contenedor al entrar y volver.

QA detectó posteriormente que el fixture `document` sombreaba al DOM en dos tests. Se renombró a `workspaceDocument`, sin cambiar aserciones. ESLint focal y TypeScript completo aprobaron (`/tmp/pro-qa-scroll-types.log`).

Por tocar títulos del panel se ejecutó el verificador estático de marca (aprobado) y se intentó la regresión de marca en los tres navegadores requeridos. Esa ejecución no aprobó: navegación a rutas públicas excedió tiempos durante compilación local y proxy interno Next. No se observó fallo de aserción de logo; no se aumentaron tiempos. Debe repetirse tras preparar las rutas; no se considera paridad pública certificada.

El objetivo continúa con [la comparación y hoja de trabajo Houzz](houzz-quality-roadmap-local.md). La aceptación ordinaria desde una solicitud de cita es un hueco confirmado y tiene cambios funcionales nuevos en preparación; la evidencia anterior no cubre esa corrección.
