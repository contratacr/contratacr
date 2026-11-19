# Preparación, cambios, constancia, paquetes y costos: ronda de inglés

4 noviembre 2026. Solo Pro local, `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Mantener todos los cambios previos, datos y demos registrados. Sin push, producción, nuevas secciones ni emisión/mensajes/cobros reales.

Se continúan las cinco tareas de la ronda anterior. Contratos españoles existentes se ejecutan también en inglés mediante escenarios explícitos equivalentes (`pro-*-english.spec.ts`). Se mantienen aserciones de importes, idempotencia, permisos, versiones, archivos privados, borradores, datos y limpieza por actores. Las preguntas/descripciones ingresadas por usuarios no se traducen automáticamente al cambiar de idioma. Los errores de API que no dependen de idioma conservan su contrato.

Selección: cinco escenarios integrados en Chromium móvil; corregir hallazgos y después ampliar a WebKit móvil. Escritorio solo cuando el alcance visual o la dependencia lo justifique. No repetir 71 escenarios ni ampliar GTI. Estática global/focal, idiomas y conservación de 78 tablas. Las pruebas de fotos usan imagen sólida sintética y bucket loopback privado. La creación de borradores vinculados es fixture de preservación, nunca emisión fiscal.

Resultados pendientes: no se considera terminado hasta probar y revisar evidencia. El devserver fue reiniciado únicamente en Pro/loopback3185, con PUSH_DELIVERY_ENABLED=false; .env.test verificado contra Supabase loopback54321.

Hallazgo de producto: PhoneInput usaba países, etiqueta del selector y ayuda de longitud en español en el editor Pro inglés, y el campo carecía de nombre accesible asociado. Se agregó idioma opcional con comportamiento español predeterminado; solo el editor Pro solicita inglés. Nombres/country label/alt/help EN y aria-label del teléfono quedan localizados sin tocar prefijos, longitudes, formateo, detección o valor persistido. La prueba de paquetes verifica opción Estados Unidos/Canadá, pista de seis de diez dígitos, cambio a CR y vaciado. Otros consumidores mantienen el comportamiento anterior por defecto.

Se corrigió el harness inicial: traducción de literales de datos ficticios, prefijos de etiquetas y textos parciales. Se conservan errores y resultados fallidos; no se cuentan como prueba del producto ni se debilitan las aserciones de datos/seguridad. Los valores ingresados por usuarios se mantienen en su idioma original.

Simulador disponible de nuevo: Safari del iPhone17Pro mostró la solicitud registrada en inglés, estado Awaiting confirmation, indicación de espera, duración120 y el historial del mismo ID. No se cambió ni canceló esa solicitud. La evidencia corresponde a lectura visual nativa, no a un guardado nuevo de estas cinco herramientas.

## Ampliación autorizada de la cola

Se añaden gastos internos/proveedores, estado de cuenta/pendientes y corrección de metadata de pagos como tres contratos EN adicionales. Conservan escenarios ES originales; no habilitan envíos ni emisión ni mueven dinero. Datos escritos por los usuarios (nombre del proveedor, concepto, referencia, motivos) conservan su idioma; los controles sí se esperan en inglés. Resultados se registran al aprobar, sin contar diagnósticos fallidos.

La observación manual de solicitud EN se completó; el intento de interactuar para comprobar el teléfono devolvió `noWindowsAvailable`, incluso intentando elevar la ventana del simulador. Se mantiene esa comprobación manual pendiente y se continúa con navegador automatizado. La vista de acceso en inglés fue solo navegación; no se introdujeron credenciales ni se cambió la cuenta guardada en este intento.


## Evidencia ya aprobada del bloque de cinco áreas

Preparación/cambios/constancia en Chromium móvil: `/tmp/pro-secondary-corrected.log` (los tres casos aprobados, no sus fallos de paquetes/costos). Costos Chromium móvil: `/tmp/pro-secondary-remaining.log` (1 aprobado, paquete fallido excluido). Paquetes Chromium móvil: `/tmp/pro-package-chrome-ready.log` (1/1). Preparación/constancia WebKit: `/tmp/pro-secondary-webkit.log` (2 aprobados, cambios/costos fallidos excluidos). Cambios/costos WebKit: `/tmp/pro-secondary-webkit-final.log` (2/2). Paquetes WebKit: `/tmp/pro-package-final.log` (1 aprobado, Chromium fallido excluido). Son diez casos por archivo/proyecto, no cada rerun. Consumidor de recuperación de cotizaciones ES: `/tmp/pro-secondary-es-consumer.log` (1/1).

La prueba de paquetes conserva el número de líneas, impuestos/importes, snapshots y formulario padre al abrir/cerrar plantillas. Se precompilan rutas locales mediante OPTIONS (204 sin ejecutar mutaciones) antes de editar para evitar recargas del servidor Next dev al abrir módulos fríos. No se presenta una recarga de desarrollo como pérdida de documentos guardados ni se retiran las aserciones de formulario sin guardar. Se conserva el diagnóstico en `/tmp/pro-package-diagnostic.log` y la captura anterior al cleanup.

Las pruebas Safari esperan la ruta del padre al cerrar subformularios y una lectura reconocida del acuerdo antes de recargar; no se desactiva la protección de cambios sin guardar ni se añade sleep/retry de tests. Se mantienen aserciones de recarga de correcciones y de rechazo de registros fuera de la página cargada.

Revisión visual de capturas: resultado de costos separa saldo y resultado de costos registrados (no utilidad fiscal), formularios/acciones en inglés sin desbordamiento en los casos probados; constancia muestra foto sintética seleccionada y recomendaciones, sin nota interna. El contenido redactado en español por el fixture permanece así al cambiar idioma: es correcto conservar datos, no traducirlos silenciosamente.


## Resultado de la ampliación y cierre

Dieciséis casos EN aprobados (ocho contratos en Chromium móvil y WebKit móvil) y tres consumidores ES (recuperación del editor, gastos internos y corrección de pagos) aprobados: **19 casos por archivo/proyecto**, sin contar reruns ni diagnósticos fallidos. [Matriz y capturas](research/2026-11-04/secondary-review/coverage.json).

Gastos/estado de cuenta Chromium: `/tmp/pro-ledger-fixed.log` (2 aprobados; metadata fallida excluida). Metadata Chromium: `/tmp/pro-metadata-final.log` (1/1). Los tres contratos WebKit: `/tmp/pro-ledger-webkit.log` (3/3). Consumidores ES: `/tmp/pro-ledger-spanish.log` (2/2). El editor ES permanece en el log anterior (1/1).

Correcciones de producto adicionales: ventanas de gastos/proveedores declaran su etiqueta accesible de cierre en el idioma activo, y las confirmaciones de descarte de correcciones de pago (botón y Escape/volver desde el detalle) declaran Cancel/Cancelar explícitamente. Se conserva el valor español anterior, las validaciones y el motor de guardado. La prueba de metadata verifica Escape, cancelar sin perder edición, guardado reconocido con lectura fallida, reintento exacto, conflicto, historial, datos históricos sin fecha y pago anulado, preservando importes y aplicaciones.

Se revisaron visualmente las capturas de constancia con foto privada, resultado de costos, historial de correcciones y gasto con pago/anulación. Los textos de sistema están en inglés en esos casos; los nombres, conceptos, motivos y referencias escritos por el fixture siguen en español deliberadamente. Fechas de interfaz EN se comparan con su formato real (Oct 3, 2026); los valores API permanecen ISO. Exportaciones y reglas de importes conservan su contrato original.

TypeScript global, ESLint focal de cinco componentes modificados y los escenarios EN, presupuesto bilingüe (sin ampliarlo), UTF-8 y diff-check: aprobados. No se ejecutó una suite exhaustiva por cambios de etiquetas ni compilaciones nativas/tiendas. Sin SQL/API/permisos nuevos, producción, push ni emisión fiscal. La revisión nativa del teléfono sigue pendiente por control `noWindowsAvailable`; la lectura visual de la solicitud EN se comprobó y quedó visible en el simulador.

Conservación final: comparación estricta de 78 tablas con 626 filas originales idénticas, 34 filas de la demostración registrada conservadas y ningún otro sobrante operativo. Se mantienen seis auditorías anonimizadas previas. El trabajo terminado, contacto, cotizaciones, borrador y entradas anteriores siguen idénticos. La solicitud de cliente sigue pendiente, su cotización continúa aceptada una sola vez y las notificaciones no cambian. Logs: `/tmp/pro-review-final-preservation.log`, `/tmp/pro-review-final-work-demo.log`, `/tmp/pro-review-final-client-demo.log`.


## Continuación: teléfono nativo y texto de acceso (4 de noviembre)

Base/HEAD: `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`, rama `local/pro-suite-no-push`; se conserva el trabajo local previo. Cambio nuevo limitado al placeholder de correo de acceso: usa `auth.login.emailPlaceholder` en ES/EN, sin cambiar autenticación, sesión ni validación. La comprobación HTTP local confirma `you@email.com` en `/en/login` y `tu@email.com` en `/login` (ES no lleva prefijo). TypeScript, ESLint focal, presupuesto bilingüe sin ampliarlo, UTF-8 y diff-check aprobados.

Simulador iPhone 17 Pro: se pudo introducir la cuenta local existente e iniciar sesión sin guardar contraseña. Hubo una pantalla de conexión durante compilación local; una navegación explícita posterior abrió el editor inglés con el cliente conservado, “Local draft for this session” y “Identification and contact (optional)”. No se pulsó Create quote ni Discard draft. Al intentar desplegar contacto, el control nativo devolvió `noWindowsAvailable`, incluso tras Raise. Por tanto, la introducción manual del teléfono sigue pendiente; no se presenta la navegación como prueba aprobada de ese campo. Quedó visible el editor inglés. El log Next registra Fast Refresh/full reload y ECONNRESET; esto no demuestra pérdida de datos guardados ni un defecto reproducido en distribución.

Selección: repetir el contrato existente de paquetes/editor EN en Chromium móvil y WebKit móvil porque incluye selector de país, ayuda de longitud, formato CR y conservación/recarga del formulario. Reutilizar la evidencia ES y las otras siete áreas EN de la ronda anterior, cuyos componentes no cambiaron en esta continuación. El primer lanzamiento no ejecutó casos: global setup pidió fixtures de regresión global ausentes. No se sembraron: el contrato elegido crea y limpia sus propias cuentas locales, y se reejecutó con `E2E_FIXTURES_READY=0`. Sin aserciones retiradas ni cambios de timeout/retries.

Resultado de esta continuación: **2/2 contratos aprobados** (`/tmp/pro-phone-recheck.log`), WebKit móvil 52,2 s y Chromium móvil 29,4 s. Comprobación final estricta: 78 tablas y 626 filas originales idénticas; 34 filas de demostración conservadas, sin otros sobrantes operativos. Trabajo terminado y solicitud de 120 minutos/cotización aceptada permanecen iguales; notificaciones sin cambios. Evidencia: `/tmp/pro-phone-preservation.log`, `/tmp/pro-phone-work-demo.log`, `/tmp/pro-phone-client-demo.log`. Sin push, producción, emisiones, mensajes reales ni borrado del borrador nativo.


## Teléfono manual completado y disponibilidad EN (continuación)

Mismo HEAD/rama, sin cambiar esquema/API/autenticación. En el simulador iPhone 17 Pro se abrió el contacto opcional del borrador existente; menú nativo de países en inglés confirmado (United States / Canada, Mexico, Colombia, Spain). Se seleccionó +1, se introdujo el número ficticio 202555 y se observó exactamente “United States / Canada uses 10 digits (6/10).”. Al volver a +506, se observó “2025-55” y “Costa Rica uses 8 digits (6/8).”. Se seleccionó y borró exclusivamente ese teléfono de prueba: campo vacío, +506, aviso desaparecido. No se pulsó crear cotización ni descartar borrador. Una navegación posterior mostró “Draft recovered” con el mismo cliente; no se afirma haber cambiado el idioma nativo a español: la navegación sin prefijo mantuvo inglés por preferencia de sesión.

Corrección adicional: AgendaCalendar declara closeLabel según idioma (Close/Cerrar); Modal compartido conserva su valor por defecto para los demás consumidores. Prueba de auditoría EN ampliada para abrir Calendar, Edit availability, comprobar el diálogo y cerrar con Close, sin Cerrar y sin escrituras. Se mantiene snapshot de datos antes/después y comprobación de nueve destinos existentes. Cobertura seleccionada: esa auditoría en Chromium/WebKit móvil y contrato de operaciones de agenda ES en Chromium móvil; evidencia previa del teléfono en dos motores reutilizada, pues no se cambió PhoneInput. Se conservan todas las aserciones.

Diagnóstico: primera ejecución EN encontró que la comprobación nueva necesitaba entrar a Calendar antes de Edit availability; se corrigió el recorrido del test. El intento ES simultáneo sufrió timeout de compilación fría y colisión de artefactos con el otro proceso: se reejecutó con directorios de salida separados. No se ampliaron timeout/retries ni se sembraron fixtures globales. ES reejecutado aprobado 1/1 en 20,9 s (`/tmp/pro-agenda-close-es-final.log`).

La siguiente ejecución EN reveló un defecto adicional de accesibilidad real: el diálogo tenía encabezado visible, pero carecía de nombre accesible (snapshot `dialog` sin nombre). Se corrigió en AgendaCalendar con ariaLabel localizado; se conserva la aserción de diálogo por nombre y se añade la equivalente ES. Los diagnósticos previos no se cuentan como aprobados.

Cierre de esta ronda: auditoría EN aprobada 2/2 en WebKit móvil (32,0 s) y Chromium móvil (32,1 s), `/tmp/pro-agenda-close-en-complete.log`; operaciones ES aprobadas 1/1 (14,2 s), `/tmp/pro-agenda-close-es-complete.log`. Los nueve destinos EN siguen sin escrituras ni cambios al snapshot, y el diálogo se encuentra por nombre y se cierra en el idioma activo. TypeScript, ESLint focal de componente y dos tests, UTF-8, presupuesto bilingüe sin ampliación y diff-check aprobados. Conservación: `/tmp/pro-agenda-a11y-preservation.log`, 78 tablas/626 originales idénticos y 34 filas demo, sin otros sobrantes. Sin push ni producción. El pendiente manual del teléfono EN queda resuelto por interacción nativa observada; no equivale a revisión exhaustiva de todos los campos/idiomas.
