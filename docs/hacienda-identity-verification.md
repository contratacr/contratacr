# Verificación con Hacienda — 17 de octubre de 2026

La aplicación usa exclusivamente `GET https://api.hacienda.go.cr/fe/ae?identificacion=…` para el cotejo automático de identificaciones nacionales, jurídicas, DIMEX y NITE. La API pública funciona sin clave ni suscripción. No se contrata RACSA. Documentación oficial: https://api.hacienda.go.cr/docs/.

## Alcance y decisiones

- La respuesta oficial determina el tipo: 01 nacional, 02 jurídica, 03 DIMEX, 04 NITE. La longitud local solo valida el formato.
- Encontrar una persona coteja número, tipo y nombre; no demuestra posesión, edad ni biometría. Las correcciones administrativas de nombre siguen teniendo prioridad para el mismo documento.
- Encontrar una identificación de cualquiera de los cuatro tipos permite verificar el cotejo y guardar el nombre o razón social oficial, salvo correcciones administrativas protegidas. La insignia no certifica representación legal ni quién opera la cuenta.
- Un 404 estructurado de Hacienda permite apelar. Un timeout, 429, 5xx o respuesta inesperada se trata como indisponibilidad, sin rechazo ni correo de revisión por ese fallo.
- Las apelaciones crean un caso privado por cuenta/documento/ciclo de decisión. Los reintentos no duplican el caso, mensaje ni apelación, y no reemplazan la gestión del administrador. Los documentos se adjuntan al mismo caso en el bucket privado existente.
- Una revisión manual abierta no puede ser aprobada por un reintento automático ni mediante la publicación de un proyecto.
- Las cuentas ya aprobadas no se verifican en masa. Un cambio de identificación elimina la aprobación anterior antes de guardar el nuevo documento.

## Datos y operación

Solo se conserva el resultado mínimo (nombre, tipo, proveedor y resultado); la aplicación no usa deudas, actividades ni situación tributaria para decidir o publicar perfiles. El aviso de consulta y la política de privacidad describen el proveedor y la revisión manual.

La caché privada existente conserva resultados utilizables durante 10 minutos y ausencias durante 1 minuto. Se limita el ritmo de consulta y se aplica pausa ante 429. Los errores no se cachean como ausencias. La actualización mensual automática del padrón queda desactivada; el flujo de mantenimiento manual y la base histórica se conservan para recuperación, sin consultas del padrón en la verificación activa.

Hacienda consulta registros tributarios y no garantiza cobertura de toda persona o documento válido. No encontrar una identificación nunca equivale a declarar que es falsa. No hay reconocimiento facial ni proveedor de identidad de pago en esta integración.

## Validación

Las pruebas de ejecución aisladas cubren los cuatro tipos, DIMEX de 11 y 12 dígitos, datos malformados, 404/429/5xx/timeout, caché, minimización, permisos, deduplicación, preservación de decisiones humanas y cambio de identificación. La prueba con Supabase local y navegador cubre apelación, reintento, documentos privados y vista administrativa en ambos formatos de cuenta; está incluida en el smoke de `test` y nunca utiliza producción para datos sintéticos.

Consulta real de solo lectura del ejemplo oficial `2100042005`: HTTP 200, tipo 02, ESTADO-MINISTERIO DE HACIENDA. Los demás tipos se prueban con respuestas controladas, sin consultar identificaciones privadas de terceros como datos de prueba.

Compatibilidad de Cloudflare comprobada con una vista previa remota: `redirect: "manual"` obtiene HTTP 200 del ejemplo oficial. Workers rechaza `redirect: "error"` antes de conectarse; la regresión comprueba que esa opción no se reintroduzca. Las respuestas 3xx no se siguen y se tratan como indisponibilidad.

## Herramientas administrativas

`/admin/identificaciones` reúne la consulta individual de los cuatro tipos y la revisión por lotes de todas las cuentas pendientes (profesionales y clientes, sin el recorte de las primeras 200 cuentas). Consultar no modifica perfiles ni envía avisos. La vista distingue registros encontrados para cotejar, registros no encontrados, fallos temporales y casos manuales.

La acción separada de verificar vuelve a consultar la elegibilidad en el servidor: solo acepta documentos que continúan guardados en esa cuenta y una respuesta válida con nombre oficial de Hacienda. Protege apelaciones, documentos abiertos, decisiones humanas anteriores, cuentas bloqueadas o deshabilitadas y aprobaciones existentes. Las consultas de antecedentes también se paginan para no omitir revisiones antiguas. Los cuatro tipos encontrados siguen el mismo criterio y se guarda el nombre oficial, sujeto a las correcciones administrativas protegidas. Se conserva la prioridad de los nombres corregidos por el administrador. No hay correos masivos; las decisiones profesionales usan el aviso dentro de la aplicación.

## Criterio uniforme y actividad del perfil — 17 de octubre de 2026

Se mantienen las aprobaciones existentes. Fotos, servicios, reseñas y casos de éxito describen actividad y calidad del perfil; no sustituyen el cotejo de identidad. No se desverifican usuarios por no completar contenido opcional. Una respuesta válida de Hacienda con nombre permite verificar nacionales, jurídicas, DIMEX y NITE con el mismo alcance. Fuente caída no equivale a no encontrada. Sin identificación o sin registro encontrado se ofrece completar datos o revisión manual. Casos abiertos, apelaciones, bloqueos y decisiones administrativas previas conservan sus protecciones.

Fuentes: documentación oficial de Hacienda (https://api.hacienda.go.cr/docs/) y distinción entre validación de atributos y vinculación de la persona en NIST SP 800-63A-4 (https://pages.nist.gov/800-63-4/sp800-63a.html). NIST se usa como referencia conceptual, no como certificación de ContrataCR.

La tarea existente `verificacion-repesca.yml` incluye una revisión explícita (`simular-pendientes` / `verificar-pendientes`) para aplicar este criterio a antiguos pendientes automáticos. Usa la misma selección protegida del administrador y comprueba que la identificación no cambió. La tarea diaria conserva su alcance anterior; no se amplía la revisión recurrente a casos ya decididos.
