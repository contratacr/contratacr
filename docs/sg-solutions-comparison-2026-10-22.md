# Privacidad, estadísticas y Meta: comparación con SG Solutions

Revisión del 22 de octubre de 2026. ContrataCR se revisó en código; SG Solutions se comparó exclusivamente con el resumen facilitado por Isaac, fechado el 21 de octubre. No constituye una auditoría de su repositorio ni una certificación jurídica.

## Qué se conserva en ContrataCR

- Búsquedas, zona y recorridos internos de cuentas y visitantes, con acceso administrativo y MFA. No se sustituyen por los agregados de SG: son un requisito de producto de Isaac.
- Separación entre la analítica propia y Meta. El contrato de salida excluye nombres, contactos, cédulas, identidad de cuenta, IP del visitante, búsquedas, ubicaciones elegidas, mensajes y documentos. Los identificadores publicitarios y datos técnicos permitidos siguen siendo seudónimos.
- CAPI para web y recibos de acciones autorizadas del servidor. Clic/contacto, publicación y contratación son hitos distintos; no acreditan un pago ni una venta incremental. Meta no recibe compras inventadas.
- Sin Pixel paralelo ni ventanas automáticas. Las preferencias siguen accesibles desde Privacidad.
- Publicidad limitada activada por defecto salvo rechazo guardado. No se fabrica una aceptación expresa ni se cambia esta decisión de producto en esta revisión.
- Operador actual como persona física hasta que exista un cambio efectivo a sociedad. No se declara constituida la sociedad futura.

## Mejoras implementadas a partir de la comparación

1. **Retirada sin conexión, incluso para invitados.** Se conserva una marca local booleana de cancelación pendiente, sin identidad ni payload. La publicidad se bloquea mientras exista. La solicitud se reintenta al montar la captura, reconectar, reanudar y recibir cambios de privacidad entre pestañas. Las peticiones concurrentes comparten el mismo envío. Solo una respuesta HTTP satisfactoria elimina la marca. Una retirada iniciada en otro navegador no puede deducirse de esta marca local.
2. **Exclusión administrativa tras cerrar sesión.** Una comprobación de rol válida genera una cookie de exclusión durante un año, sin ID de cuenta. La respetan navegador, APIs, escritura de búsquedas del servidor, conversiones y registro de plataforma. Un error al comprobar el rol excluye la petición pero no marca permanentemente un navegador como administrativo. El marcador no autentica ni concede permisos. Un navegador privado, nuevo o con almacenamiento borrado no permite reconocer por sí solo al operador.
3. **Menos conservación de datos de emparejamiento.** El procesador borra el payload cuando registra la respuesta aceptada por Meta; conserva el recibo necesario para deduplicación y estadísticas. La limpieza existente sigue atendiendo payloads anteriores y envíos caducados. No se borran las búsquedas internas.
4. **Reserva y recibos coherentes.** Antes de enviar se comprueban estado, intento y fecha de reserva. La confirmación aplica las mismas condiciones y solo cuenta envíos cuyo recibo se actualizó. Una retirada concurrente no vuelve a convertirse en pendiente ni se cuenta como una confirmación persistida. No puede retirarse con certeza un envío HTTP ya en curso.
5. **Logs de Worker reducidos.** Se desactiva la observabilidad automática del Worker en su configuración. No equivale a eliminar logs de autenticación, seguridad, otros proveedores o los registros operativos necesarios.
6. **Política bilingüe más precisa.** Se explica seudonimización frente a anonimato, exclusión administrativa y sus límites, reintento sin conexión y límites de retirada. Se actualiza la fecha informativa de Privacidad; no se inventan aceptaciones ni se abre una pantalla de nuevos términos.

## Qué no debe copiarse entre negocios

SG vende productos y servicios con pagos, entregas, garantías y facturación. Sus compromisos de siete días, Tilopay, compras pagadas y conciliación no se trasladan a un marketplace de contacto. ContrataCR tiene perfiles, documentos de identidad, mensajes, ubicación y asistente de IA: no corresponden automáticamente a SG.

La selección de agregados sin texto de búsqueda de SG no es un error ni significa que deba registrar recorridos individuales. Debe añadirse solo si SG necesita esa función y se documenta su tratamiento real.

## Qué podría revisar el chat de SG

| Capacidad de ContrataCR | Qué acredita el resumen de SG | Acción recomendada para SG |
| --- | --- | --- |
| Medición Android e iOS preparada | Indica expresamente que no se implementó medición nativa | Solo hace falta si SG distribuye apps y anuncia instalaciones; no copiar CAPI web para eludir restricciones de iOS. |
| Revocación con reintento local para invitados sin conexión | Describe revocación y supresión de cola, pero no acredita persistencia/reintento del fallo offline del visitante | Comprobarlo y probar cierre/reapertura, 503 y reconexión; no asumir que le falta sin ver el código. |
| Permisos separados para IA y explicación de verificación documental | No se describen esas funciones en SG | Solo si las usa. No añadir permisos para funciones inexistentes. |
| Eliminación de cuenta/datos coordinada con proveedores y reintentos | El resumen explica derechos y retención comercial; no acredita todo el flujo de borrado entre proveedores | Revisar implementación, identidad proporcional y excepciones por pedidos, impuestos y garantías. |
| Pruebas web, WebView y contratos nativos | SG declara pruebas web y de pagos; no nativas | Corresponde a sus plataformas reales, no es requisito para una web sin app nativa. |
| Recorridos y búsquedas internas identificables | SG usa agregados, sin recorridos ni términos escritos | Diferencia de producto, no defecto que deba corregirse. |

SG ya declara controles sólidos que ContrataCR también tiene: dataset separado, CAPI filtrada, eventos de negocio validados en servidor, MFA administrativo, exclusión de administradores, cola con deduplicación y supresión, y separación entre recepción de Meta y atribución. Su resumen describe una reserva atómica, contexto firmado y elección publicitaria previa; no debe degradarse ese diseño para imitar el nuestro.

## Pendientes reales y límites

- **Base jurídica publicitaria:** SG declara permiso actual previo; ContrataCR usa estado limitado por defecto. No son equivalentes. No tener una ventana no elimina las obligaciones de informar, justificar tratamiento y, cuando corresponda, obtener consentimiento para datos y transferencias. Revisión específica del abogado para publicidad y visitantes sin registro. La aceptación general del login no demuestra por sí sola autorización de todos los fines.
- **Conservación:** los 90 días corresponden a recorridos detallados, no a toda la plataforma. La cola existente caduca envíos a los seis días; la limpieza depende de que se ejecute su procesador. Recibos de negocio, documentos, backups y otras tablas necesitan una política operativa por finalidad; no se promete depuración universal automática. No se ha reducido arbitrariamente el histórico que requiere el panel.
- **Operación:** supervisar cron y depuración, revisar contratos/transferencias y responder solicitudes de derechos. Desactivar logs de invocación no sustituye supervisar salud y fallos de tareas.
- **Nativo:** no se publican versiones en tiendas. Continúan pendientes esquema/atribución iOS real, verificación empresarial cuando exista la sociedad y comprobación de campañas nativas en el canal permitido. Código preparado o recepción técnica no demuestra atribución a anuncios.
- **SG:** según su propio resumen siguen pendientes revisión jurídica, facturación y liquidaciones, histórico comercial, webhook Tilopay autenticado, atribución de una venta real y supervisión de limpieza. Esta comparación no los declara resueltos.

Fuentes primarias consultadas: [PRODHAB, preguntas frecuentes](https://www.prodhab.go.cr/preguntasfrecuentes.aspx), [Ley 8968, artículos 5 y 14](https://formatos.inamu.go.cr/SIDOC/DOCS/ley_8968.pdf). Las páginas públicas de términos técnicos de Meta y buenas prácticas CAPI exigieron acceso o devolvieron limitación de consultas durante esta revisión; no se atribuyen a ellas conclusiones no verificadas. Los contratos de salida y de preferencias se comprobaron en el código local.
