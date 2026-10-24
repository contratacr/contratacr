# Aplicación del plan de Meta — 10 de octubre de 2026

Estado al 10 de octubre: código compartido en `main` y `test`, migraciones 236 y 237 aplicadas en ambos entornos mediante GitHub Actions, y despliegues web comprobados. `mobile` integra estos cambios sobre `test`. No se creó otra credencial de Meta ni se activó publicidad. La conexión web existente permanece activa; la recepción de cada evento nuevo aún requiere comprobarse con acciones reales, sin fabricar resultados.

Ads Manager tiene un borrador guardado, campaña `120253387377830174`, conjunto `120253387377820174` y anuncio `120253387377810174`. Campaña apagada, objetivo Leads/web, optimización por evento estándar `Contact` del dataset 1980721055914350, Costa Rica, edad mínima 25, presupuesto **total** de US$10,62 y cierre configurado para el 17 de octubre. Destino `https://contratacr.com/buscar`, con parámetros UTM guardados aparte. Una pieza de vídeo existente de ContrataCR, texto y título de este documento. Todas las mejoras creativas de IA se dejaron apagadas. Meta indica que falta aceptar los términos de anuncios de clientes potenciales para poder publicar. La publicación, el gasto y la aceptación de esos términos están pendientes de autorización concreta del usuario.

## Cambios implementados

- Contactos de servicios confirmados por los API de WhatsApp y revelación de teléfono/correo. Excluye empleos, productos, autocontactos y contactos del profesional al cliente. También evita preguntar por una contratación a quienes consultaron un producto o se contactaron a sí mismos.
- Evento de proyecto después de guardarlo; contratación declarada después de guardar `hired`; primeras publicaciones de perfiles utilizables, promociones de servicios y empleos; contacto del profesional a proyectos.
- La aceptación de una cotización ligada a un proyecto se conserva como resultado interno del profesional. No se transmite la identidad del cliente a Meta como si fuera el profesional ganador. La conversación externa y los pagos no se verifican: no hay evento Purchase ni ingresos inventados.
- Migración 237: recibos permanentes, cola privada y reclamación atómica con `SKIP LOCKED`; ninguna escritura desde roles del navegador. Publicaciones históricas se registran como antecedentes excluidos y no se reenvían por editar/renovar. Los borradores históricos quedan disponibles para su primera publicación real.
- Contactos: una acción por persona/dispositivo y profesional por día de Costa Rica, independientemente del canal. Publicaciones: una acción por entidad. Proyectos contactados: una por profesional y proyecto. Contratación declarada: una por seguimiento. Hay un identificador común entre Pixel y CAPI para deduplicar ambos canales.
- Todos los recorridos válidos devuelven el recibo al navegador y emiten también por Pixel tras éxito, aprovechando la conexión CAPI web existente. Sin envío directo propio, el recibo queda `browser_only`, sin payload de coincidencia almacenado. La recepción nueva aún debe comprobarse en Meta.
- CAPI directa opcional: reintentos conservan el identificador y la hora original, aceptación requiere `events_received=1`; reclamaciones interrumpidas se recuperan tras cinco minutos. Se distingue entrega de prueba de entrega a producción. Se borran datos de coincidencia de entregas después de un día y pendientes después de seis; se conservan recibos sin el payload. El cron limpia incluso cuando la entrega está deshabilitada.
- Se excluyen pruebas, dominios de regresión/locales, bots, rechazo de analítica y aplicación nativa del envío a Meta. El servidor requiere la preferencia web reflejada en una cookie; conserva la política actual del Pixel. Los datos de coincidencia son identificador de usuario hash, navegador y cookies de Meta existentes. No se transmiten correos, teléfonos, textos de proyectos, mensajes, cédulas, presupuestos o categorías de salud. La URL enviada es una ruta general sin query, slug ni identificadores.
- Atribución de la acción conserva campaña reciente y origen inicial separados durante treinta días, también para usuarios existentes. No sustituye evidencia causal ni hace que un `fbclid` orgánico sea publicidad pagada.
- Los avisos de proyectos y su contador usan la misma selección: servicio activo, cuenta habilitada y cobertura pertinente. No se distribuyen a toda una categoría nacional si el proyecto tiene ubicación y el profesional no cubre la zona. Una videoconsulta en el perfil no habilita cualquier oficio en todo el país.
- Panel Campañas: resultados por acción/campaña, personas/dispositivos distintos, estado de entrega, modo de prueba y presupuesto. El panel no compra anuncios ni detiene campañas en Meta.
- Flujo de despliegue de Cloudflare preparado para las nuevas variables; cron de entrega cada diez minutos, tandas de cinco y autenticación del servidor.

## Corrección del presupuesto

El techo de US$20 incluye gasto anterior del mes. La auditoría de Ads Manager ya encontró US$9,38 en octubre; por tanto, una nueva prueba de siete días este mes tiene un máximo preliminar de **US$10,62**, no US$14 adicionales. Debe conciliarse gasto actual antes de publicar, porque el registro es una fotografía del 10 de octubre y no una conexión en vivo a facturación.

El panel utiliza el mayor entre gasto registrado en Costos y ese mínimo conocido de octubre; no suma dos veces ambos ni convierte el dato de Meta en un pago bancario confirmado. US$14 sigue siendo el máximo por prueba cuando el saldo mensual lo permite. Si Meta exige un mínimo superior, no aumentar el tope automáticamente; dejar la prueba pendiente.

## Conexión y publicación pendientes

1. Reutilizar la conexión CAPI web de Meta ya activa en el dataset **1980721055914350**, identificada en Events Manager y Business Management. No generar una segunda credencial ni contratar un gateway. La inspección de secretos `production` confirmó que no hay configuración de envío directo propio, lo que no equivale a ausencia de CAPI externa.
2. Solo si posteriormente hace falta envío directo independiente del navegador y después de autorizar la credencial correspondiente, configurar en producción y Worker: `NEXT_PUBLIC_META_PIXEL_ID=1980721055914350`, `META_CAPI_ACCESS_TOKEN`, `META_GRAPH_API_VERSION` con una versión vigente verificada, `META_CAPI_ENABLED=false` inicialmente. `CRON_SECRET` ya existe en el entorno GitHub. La versión no se adivina ni se incrusta como una versión posiblemente caducada.
3. Compartir el código manteniendo `main` y `test` iguales conforme a AGENTS.md. Aplicar migraciones por el workflow oficial: dry-run y apply en test, después dry-run y apply en producción. La 237 sigue a la 236 pendiente de la revisión de campañas. No ejecutar SQL de esquema manualmente sobre cuentas reales.
4. Desplegar primero sin entrega CAPI. Confirmar guardados y recibos, exclusiones, atribución y que un reintento no agrega otra acción. Verificar también perfiles recién completados desde ambos editores.
5. Comprobar los nuevos eventos de Pixel y la conexión CAPI existente en Test Events. Para la integración directa opcional, configurar además código de Test Events y habilitar entrega para una comprobación controlada. Confirmar evento, parámetros `action`/`audience` e identidad de deduplicación en Meta, además del acuse del servidor. No usar datos de prueba como resultados reales.
6. Si se probó envío directo propio, para salir del modo de prueba establecer **`META_CAPI_TEST_EVENT_CODE=off`**, tanto en GitHub como en Worker. Esto evita que quitar solo el secreto de GitHub deje un valor antiguo en el Worker, cuyo sync omite valores vacíos. Confirmar una entrega real y crear la conversión específica `Contact` con `action=service_contact` y `audience=client` si Meta la admite.
7. Crear una sola campaña de clientes, objetivo Leads/web y esa conversión validada; un conjunto y hasta dos anuncios. Revisar audiencia/cobertura, destino y mínimo de moneda. Reconciliar gasto; presupuesto total con fechas de siete días, máximo US$10,62 para octubre según el gasto conocido y tope de US$20 mensual. Sin extensión ni incremento automático.
8. Detener/revisar si falla la medición o se rompe el contacto. Al finalizar conciliar personas que contactaron, respuesta y contratación declarada. Cero contactos pertinentes no justifica prolongar para «salir del aprendizaje». Pocos resultados son evidencia inconclusa.

## Textos preparados, todavía sin publicar

Anuncio principal:

> ¿Necesitás resolver un trabajo en tu casa o negocio? Encontrá profesionales, revisá sus servicios y contactalos directamente desde ContrataCR.

Título: **Encontrá el profesional que necesitás**. Destino: `https://contratacr.com/buscar?utm_source=meta&utm_medium=paid&utm_campaign=clientes-servicios-oct26&utm_content=contacto-a`. Segundo anuncio únicamente si el reel existente comunica esta misma intención; contenido `reel-confianza-b`. No abrir otro conjunto para probarlo con este presupuesto.

Publicación orgánica para clientes: **¿Tenés un trabajo pendiente? Buscá profesionales o publicá lo que necesitás en ContrataCR.** Enlace: `https://contratacr.com/buscar?utm_source=instagram&utm_medium=organic&utm_campaign=clientes-servicios-oct26&utm_content=publicacion-clientes`.

Publicación orgánica para profesionales: **Mostrá qué servicios ofrecés y dónde trabajás. Completá tu perfil para que las personas sepan cuándo contactarte.** Usar el enlace público del registro profesional, con una campaña propia `profesionales-organico-oct26`, tras verificar el destino de acceso/registro. No mezclar sus resultados con clientes.

Empleos y promociones permanecen sin campañas pagadas separadas. La recuperación específica de registros incompletos conserva la audiencia y el texto de `professional-registration-review-2026-10-10.md`; no se mandó correo masivo ni se interpretó esta implementación como autorización para enviar nuevas tandas a toda la base.

Lectura agregada adicional de oferta activa: plomería tiene 18 perfiles con servicio activo y 12 con provincia principal/cobertura provincial San José; redes e internet 25, cámaras de seguridad 22. Hubo contactos a profesionales de varias categorías, pero las cifras por categoría principal no demuestran el servicio exacto solicitado, personas distintas ni respuesta del profesional. Son candidatos para revisar oferta; no prueban una categoría ganadora ni justifican prometer resultados de contratación. La ubicación principal no representa por sí sola toda el área de servicio.

## Validación

- Diez pruebas focales de contratos y ejecución del código real: públicos, perfil utilizable, cobertura, personas distintas, saldo mensual con gasto anterior, consentimiento/domino/nativo/bots, recibos, Pixel en espera y deduplicación, acuses y reintentos CAPI.
- Once verificaciones SQL en Postgres aislado en memoria: instalación/repetición, exclusión de antecedentes, unicidad, reclamación, bloqueo, recuperación, espera, borrado de payload, vencimiento y permisos. Ninguna cuenta ni evento real tocado.
- Regresión focal conjunta: 26 pruebas de Meta, campañas y costos pasaron. Se conserva la separación entre presupuesto y gasto registrado.
- TypeScript, lint focal de módulos nuevos y revisados, texto UTF-8 y `git diff --check`. Los editores existentes y el formulario de proyectos tienen errores previos del lint de React Hooks; la modificación no los introduce. No se presenta un lint global limpio.
- Compilación completa Next.js: exitosa, con credenciales del entorno aislado de regresión. Se conserva una advertencia previa de `node:http` en instrumentation/Edge y de middleware; no se atribuyen a la integración nueva.
- Los eventos reales nuevos en Meta siguen pendientes. No confundir las pruebas locales con entrega efectiva de Meta o con cambios ya visibles en producción.

## Nueva comprobación directa de Meta

Al terminar la implementación, Events Manager finalmente cargó. Dataset 1980721055914350: 27,3 mil PageView, 428 Search, 74 CompleteRegistration y 28 Contact, todos mostrados con integración Multiple, para 12 de septiembre–9 de octubre. El panel y la ventana de integraciones identifican Conversions API y Meta Pixel como Active. Esto corrige la limitación de la investigación inicial: existe una conexión CAPI fuera del código auditado, aunque todavía falta identificar su origen y comportamiento. No se debe crear una segunda conexión ni adquirir un servicio sin revisar la existente. La entrega CAPI directa nueva permanece apagada y no sustituye esa revisión.

Business Management confirmó que la conexión es **Conversions API with Meta**, web-only, con conexión automática de datasets propios activada. El dataset ContrataCR está conectado; Events Manager muestra opt-in del 15 de julio y eventos recientes. Se conserva esa configuración. No se modificaron switches de privacidad, advanced matching, eventos automáticos ni conexiones.
