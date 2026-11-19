# Formularios de Pro

26 de octubre de 2026. Solo checkout Pro, local/pro-suite-no-push, HEAD 06b70019de69bb4e1ee46ead3eda22eedf05f7d0, conservando todos los cambios previos. Sin push, main/mobile, migraciones ni datos de producción.

Cambios: títulos de edición específicos; indicación de campos necesarios; productos nuevos con existencias/mínimo/costo en 0 sin exigir reescribirlos (precio sigue explícito); atajos de duración que cambian el final desde el inicio solo al pulsarlos, incluyendo medianoche y recuperación de borrador; en cotizaciones Pro, nombre primero e identificación/contacto opcionales plegados pero montados para conservar datos. Cotizaciones con líneas parciales muestran error antes de omitirlas. El flujo del profesional ordinario conserva su presentación. Se revisan creación/edición de entidades y edición del borrador de cotización; no se añade mutación de documentos emitidos.

Selección antes de ejecución: nuevo recorrido de formularios con cuentas desechables y comparación de datos, editor con recuperación/identificación/reintento de vinculación, panel UX de metadatos y profesional ordinario. 4 casos por perfil, WebKit móvil y Chromium escritorio/móvil: 12 casos. Se reutiliza evidencia compatible de APIs/SQL/RLS e integración porque no cambian sus entradas. No se toca encabezado compartido ni marca. TypeScript de fuentes, ESLint, UTF-8/bilingüe, preservación y simulador. Limitación previa de tipos Next/Empleos documentada en navigation-paths-local.md.

## Verificación en curso

La primera selección obtuvo 6/12: se corrigió el vínculo de etiquetas con asterisco mediante aria-label explícito y se mantuvo la exigencia de nombre accesible para diálogos. Modal admite ariaLabel optativo; solo los formularios Pro lo pasan y los demás conservan salida igual. La segunda selección obtuvo 9/12: creación/edición completa y profesional ordinario aprobados en Chromium escritorio/móvil; tres interrupciones de navegación en WebKit al salir por historial. Los tests usan ahora gotoOK existente para esperar navegación sin quitar aserciones. La recuperación del editor fue aprobada en WebKit/escritorio antes del cambio de etiqueta; su fallo móvil inicial mostraba solo carga durante compilación. Logs /tmp/pro-forms-selected.log y /tmp/pro-forms-final.log conservados.

La revisión nativa encontró que la duración saltaba de fila; se ajusta a tres columnas iguales con título arriba. Repetición seleccionada: formularios, editor y panel UX (9 casos), por cambio de layout y helper de pruebas. Se reutilizan los 3 casos de profesional ordinario aprobados, sin cambios a sus entradas efectivas (prop ariaLabel ausente y rama visual original).

## Resultado final

**9/9 casos finales aprobados en 3,6 minutos**, sin skips, en WebKit móvil y Chromium escritorio/móvil. /tmp/pro-forms-complete.log y /tmp/pro-forms-complete contienen evidencia. Más los 3 casos compatibles de profesional ordinario de la selección anterior: cobertura de los 12 casos elegidos, sin presentar las ejecuciones iniciales como verdes.

El nuevo recorrido crea cliente con nombre solamente y producto con código/nombre/precio, edita ambos y compara todos los datos previamente guardados (identificación, contacto, notas, negocio, categoría, unidad, CABYS y existencias). En cita comprueba 23:45 + 30 minutos = 00:15 del día siguiente, recupera tras recarga, guarda y edita a 60 minutos sin cambiar otros datos. En cotización mantiene contacto plegado, bloquea una segunda línea con cantidad cero sin POST, exige ambas líneas válidas y conserva identificación/email/teléfono. El editor prueba además cambio de cuenta, identificación sin lookup externo, reintento sin duplicado, recarga y descarte de borrador. No se debilitan aserciones.

ESLint final y TypeScript estricto de fuentes aprobados: /tmp/pro-forms-complete-lint.log y /tmp/pro-forms-complete-tsc.log. UTF-8, env privados, presupuesto bilingüe 427/65 y diff whitespace aprobados. Se mantiene la limitación previa del chequeo global de tipos generados de Next para Empleos.

Simulador iPhone 17 Pro/iOS 26.5 con app temporal y servidor loopback: revisados visualmente clientes, producto con ceros, cotización compacta y cita con duración en una fila. Se abrió y cerró sin guardar en la cuenta conservada. El control nativo fue intermitente (noWindowsAvailable): se relanzó la app temporal y se pudo continuar entre formularios, pero el clic final en 120 min permaneció bloqueado. No se afirma validación funcional nativa de ese clic; los atajos 30/60 y su persistencia están cubiertos por E2E reales locales. Se dejan pantalla/capturas para revisión:
- /tmp/contratacr-pro-formulario-cliente-20261026.png
- /tmp/contratacr-pro-formulario-producto-20261026.png
- /tmp/contratacr-pro-formulario-cotizacion-20261026.png
- /tmp/contratacr-pro-formulario-cita-20261026.png

Comparación exacta final de documentos/revisiones: 2 cuentas, 11 citas, 10 cotizaciones anteriores, 50 disponibilidades, 46 clientes, 45 productos y 10 movimientos intactos; respaldo original 11 clientes/10 productos también coincide. Sin entidades normalizadas en JSON core. Misma rama y HEAD, sin commit, push ni cambios en main/mobile.


## Cierre de simulador: duración 120 minutos

26 de octubre de 2026. Misma rama y HEAD. En esta ronda el control nativo vuelve a responder: pulsados 30/60/120 desde 09:00, terminan respectivamente 09:30/10:00/11:00. Tras cambiar Inicio con el selector de iOS a 00:11, 120 termina 02:11; usa el valor actual, no el inicio anterior. Sin guardar la cita ni modificar entidades existentes. Captura /tmp/contratacr-pro-simulador-120min-20261026.png (09:00→11:00). No se encontró defecto del botón y no se cambia código de producto.

La rueda horaria de iOS no respondió de forma fiable para fijar 23:45 desde automatización; no se atribuye esa combinación al simulador. Se amplía la prueba existente para exigir 23:45 +120 =01:45 del día siguiente y su conservación tras recarga, luego vuelve a30 antes de las comprobaciones de guardado existentes. Solo este caso ampliado se ejecuta en los tres perfiles (WebKit móvil y Chromium escritorio/móvil). Se reutiliza evidencia compatible del resto de formularios, API y esquema, sin repetir suites completas. **3/3 aprobados en 1,8 minutos**, sin skips: /tmp/pro-duration120-final.log y /tmp/pro-duration120-final. También aprobado ESLint de la prueba ampliada (/tmp/pro-duration120-lint.log), UTF-8 y diff whitespace. La conservación de datos/revisiones se reconfirmó con los dos comparadores originales. Misma rama/HEAD; sin commit ni push.

Se cierra el pendiente específico del clic nativo de 120 minutos de la ronda anterior. La comprobación funcional nativa es 09:00→11:00 y, tras cambiar Inicio, 00:11→02:11. El cruce de medianoche con recarga pertenece a los tres perfiles de navegador, sin atribuirlo al selector nativo. Captura adicional: /tmp/contratacr-pro-simulador-120min-inicio-cambiado-20261026.png. Solo se amplían prueba y documentación; el código de los formularios permanece igual.
