# Plan de medición y captación con inversión limitada

Fecha: 10 de octubre de 2026, Costa Rica. Investigación de código, consultas de producción de solo lectura y fuentes oficiales de Meta. Complementa `meta-ads-review-2026-10-10.md`. No se modificaron campañas, audiencias ni integraciones. No se enviaron eventos nuevos ni correos.

## Decisión recomendada

Primero medir acciones que corresponden al objetivo; después invertir en un solo objetivo a la vez. Para la etapa sin ingresos: captar demanda de servicios con una prueba inicial de US$14 total, y activar a los profesionales existentes mediante el producto y comunicación dirigida. No dividir ese gasto entre clientes, profesionales, empleos, promociones y seguidores.

Meta puede recibir eventos de todos esos recorridos, pero cada campaña debe optimizar una conversión definida. Enviar más clases de eventos no hace que una campaña optimizada para visitas empiece a optimizar contrataciones automáticamente. Los registros, los contactos, los proyectos y las contrataciones son resultados distintos.

## Evidencia propia

Período de eventos: 10 de septiembre a 9 de octubre completos, en Costa Rica (`2026-09-10T06:00:00Z` a `2026-10-10T06:00:00Z`). Lectura paginada de `interaction_events`; cuentas y publicaciones consultadas por fecha.

| Dato observado | Resultado | Implicación |
| --- | ---: | --- |
| Profesionales activos en la auditoría previa | 317 | Hay oferta existente que se puede activar antes de pagar por más registros |
| Clics registrados a WhatsApp/teléfono/correo | 499 | El total mezcla contextos; no es un KPI de clientes de servicios |
| Contactos con origen jobs | 452 | Principalmente búsqueda de empleo, no contratación de un servicio |
| Contactos con origen profile/search/offers | 45 | Señal más cercana a intención de contratar; requiere validar contexto y repetición |
| Pares distintos visitante/profesional en esos tres orígenes | 39 | No significa 39 clientes únicos ni 39 contrataciones; el mismo visitante puede contactar varios profesionales |
| Contactos de esos tres orígenes en la última semana | 29 | Más volumen reciente, todavía sin atribución causal a publicidad |
| Eventos project_published | 3 | Escasa señal para optimizar solo proyectos; la tabla projects no conserva filas creadas en el período, por lo que hay que reconciliar borrados/pruebas antes de tratar esos eventos como proyectos reales |
| Eventos project_lead_whatsapp | 6 | Intentos del profesional de contactar un proyecto; no trabajos ganados |
| Nuevas publicaciones en professional_offers | 8 | 4 service_offer y 4 product; no todas son promociones de servicios |
| Nuevos job_posts conservados | 12 | Son publicaciones de empleadores, distinto público que quienes solicitan empleo |
| Cotizaciones conservadas del período | 1, estado sent | No hay aceptación en esa fila; insuficiente para optimizar contratos aceptados |
| Seguimientos de contacto del período | 319: 37 contacted, 282 dismissed | No hay hired conservado en ese grupo; dismissed no prueba ausencia de contratación real |

El anuncio reciente gastó US$9,38 por 342 visitas y se optimizaba por Landing Page Views. No hay perfiles con campaña `clientes-oct26`. Los seis clientes del 9 de octubre figuran directos, cuatro dejaron reseñas al mismo profesional. No usarlos como conversiones de la campaña.

## Estado del código y huecos

- Pixel actual: PageView, Search, CompleteRegistration y Contact.
- CompleteRegistration distingue parámetros client/professional en algunas llamadas, pero el nombre general mezcla propósitos: registrarse para reseñar, buscar trabajo, buscar servicios o publicar un perfil. La campaña debe filtrar un propósito válido, no solo ese nombre.
- Contact ya excluye `jobId` en `direct-chat-launcher.tsx`. Los 452 contactos de empleos internos no prueban que estén llegando como Contact a Meta. Hay que conservar esa separación y verificar cada botón, incluyendo proyectos y ofertas, antes de definir la conversión.
- Proyectos publicados se registran en analítica interna desde el API; no encontré envíos Meta de project_published, contratación confirmada, ofertas publicadas ni empleos publicados.
- Hay tipos internos de propuestas, pero listar un tipo no prueba que se emita en producción; revisar cada transición efectiva.
- No encontré integración Conversions API en el código auditado. Los módulos `server-events.ts` y `server-interactions.ts` guardan analítica propia, no mandan eventos a Meta.
- El seguimiento de WhatsApp permite al usuario marcar hired. Puede servir como señal de contratación declarada, pero no confirma un pago ni verifica la conversación externa.
- La atribución UTM guarda el origen en el registro del perfil. Para evaluar acciones de usuarios existentes también se necesita atribución del contacto/proyecto, no solo del día en que abrieron su cuenta. Mantener origen inicial y origen reciente por separado.
- La cola del Pixel corrige eventos anteriores a la carga del script, pero el código no demuestra su recepción por Meta ni evita por sí solo todos los duplicados por repetición de una acción.
- Events Manager no logró cargar sus datos accesibles durante esta consulta; no se confirma cuáles de estos eventos están activos/elegibles para optimización en la cuenta.

## Contrato propuesto de eventos

Nombres de eventos personalizados propuestos; aún no implementados ni creados como conversiones en Meta. Un único dataset puede contener ambas funciones de la plataforma, siempre que se distingan y que cada campaña elija su conversión.

| Resultado del producto | Evento propuesto | Momento exacto | Uso inicial |
| --- | --- | --- | --- |
| Contactar servicio profesional | Contact + action=service_contact, audience=client | Tras respuesta exitosa que habilita el contacto; excluir empleo, contacto a cliente de proyecto, autocontacto y pruebas | Posible señal de optimización inicial de clientes, si elegible en la cuenta; medir contactos únicos válidos |
| Publicar una necesidad/proyecto | Lead + action=project_published, audience=client | Proyecto guardado y publicado por el servidor, no al tocar el botón ni guardar borrador | Conversión de calidad secundaria; candidata a optimización cuando haya volumen real |
| Declarar contratación | ServiceHireConfirmed | Primera transición autorizada del seguimiento a hired, o aceptación válida de propuesta/cotización según el caso | Resultado final declarado; todavía no base de optimización por bajo volumen |
| Publicar perfil profesional utilizable | ProfessionalProfilePublished | Primera vez con servicios activos y contacto/cobertura válidos; definir por separado mínimos para foto y biografía | Medición de adquisición profesional; evitar optimizar por registro sin terminar |
| Contactar un proyecto | ProfessionalProjectContact | Contacto habilitado al profesional, una vez por contexto/acción | Activación profesional; no llamarlo proyecto ganado |
| Ganar un proyecto | ProfessionalProjectAccepted | Cliente acepta una propuesta dentro de la plataforma | Resultado final para oferta; requiere comprobar que ese flujo sigue vigente |
| Publicar oferta/promoción de servicio | ServiceOfferPublished | Primera publicación efectiva en professional_offers, offer_type=service_offer | Activación; separar product y excluir borradores, ediciones y renovaciones |
| Publicar empleo | EmployerJobPublished | Primera publicación efectiva del empleo por el empleador | Objetivo posterior de empleadores; no mezclar con postulantes |

Cuando varios eventos describan la misma contratación, asignar una identidad común de negocio o un origen excluyente para no contar seguimiento hired + cotización aceptada como dos contratos sin comprobar que sean distintos. No emitir Purchase ni valor de ingresos ficticio: ContrataCR no registra ese pago.

Para Pixel + CAPI: identificar cada acción de forma estable, deduplicar los dos canales, emitir desde transiciones exitosas y mantener un registro de entregas/reintentos. Revisar documentación oficial de la API y la configuración concreta antes de implementar. No enviar texto de proyectos, mensajes, cédulas ni detalles de servicios sensibles; CAPI no debe eludir consentimiento ni exclusiones de analítica. Credenciales solo en servidor.

## Campaña inicial: clientes con intención

Propuesta, no activación autorizada:

- Objetivo candidato: Leads, ubicación web, conversión específica de contacto de servicio. Confirmar su disponibilidad y elegibilidad en Ads Manager después de validar eventos. No seleccionar tráfico solo por su costo por visita.
- Un conjunto, uno o dos anuncios, una misma propuesta de valor y destino coherente. No comparar muchos públicos con este presupuesto.
- Destino: búsqueda de servicios con contexto de la necesidad, o publicar-proyecto cuando se pruebe ese mensaje. Evitar mandar ambas promesas a una portada genérica.
- Priorizar servicios con profesionales activos que contesten y tengan cobertura real en la zona escogida. Antes de elegir provincia o especialidad, comprobar oferta y tiempos de respuesta; los datos consultados no justifican una región específica.
- Geografía definida por cobertura disponible. Público amplio dentro de esa cobertura como punto de partida propuesto; no asumir que intereses precisos o lookalikes pequeños resulten más baratos.
- No usar una audiencia de «todos los registrados» como ejemplo de buenos clientes: contiene profesionales, personas buscando empleo y cuentas para reseñar. Una audiencia futura debe basarse en clientes que hicieron acciones válidas, con suficiente tamaño y permisos.
- Mantener un mensaje concreto: «¿Necesitás resolver un trabajo? Encontrá profesionales y contactalos en ContrataCR». Para proyectos: «Publicá lo que necesitás y recibí contactos de profesionales». No prometer contratación garantizada.

Contact es una señal intermedia: puede subir el volumen de consultas sin aumentar contratos. Medir respuesta, necesidad válida y contratación declarada después. El objetivo deseado es contratar, pero ahora hay muy poca señal final conservada para optimizar solo por contratación.

## Gasto y reglas de decisión

Primera prueba propuesta: **US$14 total durante siete días**, equivalente a US$2 diarios promedio. Usar presupuesto total con fechas si la configuración lo permite y validar mínimos/moneda. Los montos de este documento son propuestas de límites, no autorización para invertir ni garantías de entrega. Si Meta rechaza ese mínimo, no subirlo automáticamente.

Propuesta de techo del primer mes: **US$20 en anuncios**, incluyendo esa prueba. Separarlo de la suscripción de IA y otros gastos operativos. No adquirir un servicio externo de tracking para esta etapa sin comparar su costo con el presupuesto; instrumentación sobre la infraestructura existente primero.

Antes de arrancar, escribir qué gasto por contacto válido puede tolerarse como experimento. Ejemplo de decisión, no umbral de rentabilidad: US$14 con cinco personas que contacten un servicio daría US$2,80 por persona. Con una sola daría US$14. Los contactos repetidos de la misma persona no bajan artificialmente ese costo.

- Pausa inmediata si se pierde medición, se rompe el flujo o aparecen resultados de empleo mezclados con clientes.
- Al terminar siete días o llegar al tope, conciliar gasto, UTM y acciones propias. Si hay cero contactos/solicitudes válidos, revisar anuncio/destino y no extender el gasto para «que aprenda».
- Si hay pocos resultados, clasificar la prueba como inconclusa; no declarar éxito ni fracaso estadístico solo por un día.
- Si hay contactos válidos, medir cuántos recibieron respuesta y cuánto costaron antes de proponer otra inversión. Haber generado resultados no autoriza superar el techo.
- No aumentar gasto por advertencia Learning limited, puntuación de oportunidad, visitas baratas o seguidores. Primero debe existir evidencia de resultados pertinentes.

Un presupuesto menor recoge evidencia más lentamente; no garantiza salir del aprendizaje. Sin ingresos, el éxito inicial es conocer el costo y calidad de la demanda a un gasto tolerable, no afirmar retorno de inversión.

## Profesionales, empleos y promociones sin fragmentar anuncios

Durante la primera prueba, trabajar la oferta existente sin presupuesto adicional de ads:

1. Recuperar los 12 candidatos de registro incompleto identificados en el análisis previo, con un único correo específico si se autoriza su envío; resolver antes la sugerencia pendiente.
2. Mejorar perfiles de profesionales existentes: servicio claro, contacto y cobertura; información concreta dentro del panel.
3. Ante un proyecto publicado, avisar a profesionales pertinentes por servicio/cobertura y medir si contactan, responden y son contratados. No enviar el mismo proyecto a toda la base.
4. Facilitar publicación de ofertas y empleos en el panel, medir primera publicación y contactos recibidos. No abrir campañas pagadas separadas antes de comprobar que esas publicaciones atraen demanda real.
5. Usar publicaciones orgánicas y enlaces UTM distintos para clientes, profesionales, empleadores y promociones. No enviar mensajes externos ni correos durante esta investigación.

En una segunda fase, probar adquisición profesional separadamente si faltan profesionales activos en una categoría/zona con demanda comprobada. Más oferta sin demanda puede producir registros abandonados sin ayudar a las contrataciones.

## Validación antes de pagar

- Cada resultado válido emite una acción; errores/borradores no emiten conversión.
- Actualizar página, pulsar dos veces o reintentar no duplica la acción de negocio.
- Clientes y profesionales, solicitar empleo y contratar servicios, crear una oferta y comprar un producto quedan distinguibles.
- Evento visible en Test Events, diagnóstico limpio y conversión elegible en la cuenta, sin eventos de pruebas mezclados con resultados reales.
- Consentimiento/exclusiones y aplicación nativa se respetan. No asumir que Pixel web mida correctamente todas las acciones nativas.
- Se puede conciliar acción en base, evento recibido, origen de campaña y gasto. Conservar también señales negativas/respuesta del profesional para análisis interno.

## Fuentes primarias

- Meta Blueprint, selección de objetivos: https://www.facebookblueprint.com/student/path/219699-selecting-objectives-course — objetivo, ubicación de conversión y resultado deben alinearse.
- Meta, guía de generación de clientes potenciales: https://about.fb.com/ltam/wp-content/uploads/sites/14/2023/11/LeadGenerationGuide.pdf — Leads, formularios web y optimización por conversiones. El buscador permitió consultar el contenido, pero la descarga completa excedió el límite de la herramienta.
- Meta Blueprint, optimización de CAPI: https://www.facebookblueprint.com/student/activity/609643-optimize-meta-conversions-api — validar recepción, cobertura, calidad, deduplicación y actualidad de datos junto al Pixel.
- Meta Blueprint, conversiones personalizadas y resolución de fallos del Pixel: https://www.facebookblueprint.com/student/activity/251480-optimize-and-troubleshoot-the-meta-pixel — las conversiones personalizadas permiten definir resultados más específicos; la disponibilidad real se valida en la cuenta.
- Meta, visitas de página de destino: https://about.fb.com/news/2017/06/better-understand-interactions/ — explica el objetivo de llegar a la web, distinto de completar una acción final.

No se verificaron reglas numéricas universales de aprendizaje ni de variación de presupuesto. No se promete reducción de costo por implementar CAPI. La instrumentación mejora la calidad de la señal; resultado también depende de demanda, anuncio, flujo y respuesta profesional.

## Estado posterior de implementación

El 10 de octubre se aplicaron cambios locales y se probaron contratos, recibos, consentimiento/exclusiones, deduplicación y presupuesto. Detalle en `meta-growth-implementation-2026-10-10.md`. No se desplegó ni activó publicidad. Al incluir los US$9,38 ya reportados por Meta en octubre, una nueva prueba tiene un máximo preliminar de US$10,62 dentro del techo mensual de US$20; no corresponden US$14 adicionales este mes. Falta conciliar gasto actual, conectar CAPI y confirmar recepción en Meta antes de publicar una campaña.
