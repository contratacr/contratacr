# Clientes: identificación primero — Pro local

5 de noviembre de 2026. Rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push, producción, comunicaciones o documentos fiscales. Se conserva el trabajo local anterior.

## Recorrido

Identificación pasa al inicio del formulario. En un cliente nuevo, al salir de un número válido se consultan los datos disponibles, sin botón adicional. Sin identificación o sin resultado se puede completar el nombre manualmente. No se obliga a excluir a clientes extranjeros o sin documento disponible.

1. Se busca una ficha del propio profesional, incluso archivada. Si existe se ofrece abrirla, manteniendo sus datos e historial y evitando otro registro con la misma identificación. La navegación conserva el regreso al formulario anterior.
2. Si no hay ficha, se recuperan nombre, correo y teléfono de una cotización previa de ese profesional con esa identificación, excluyendo documentos eliminados.
3. Si no hay datos previos, se reutiliza la consulta de nombre de identificación existente. No se consulta el padrón durante las pruebas: sus respuestas se simulan y los ejemplos manuales usan solamente datos ficticios ya disponibles localmente.

Se rellenan campos vacíos; nunca se reemplaza lo escrito por la persona. Al cambiar de identificación se retiran únicamente los valores autocompletados que siguen sin editar. Esa procedencia acompaña al borrador de sesión para que la misma protección continúe tras recargar. Respuestas antiguas se cancelan al cambiar el documento, desmontar o iniciar otra consulta. Los errores mantienen la entrada manual; volver a salir del campo permite reintentar.

## Cuenta en ContrataCR y privacidad

Tener una cuenta no significa que su correo, teléfono, dirección o datos privados puedan mostrarse a quien conozca la cédula. Esta entrega no consulta ni enumera perfiles globales ni revela si una identificación tiene cuenta. Reutiliza datos ya poseídos por el profesional y el nombre obtenido por la consulta existente. No crea una asociación nueva con una cuenta por coincidencia de documento. Compartir información privada adicional desde una cuenta requiere un recorrido con autorización de su titular; no se presenta como implementado.

La API privada existente acepta el propósito adicional `client_contact`; conserva sesión, origen, acceso Pro, bloqueo de perfiles, límite distribuido y cuerpo estricto de una identificación. La cuota se aplica antes de consultar datos propios. El ID va por POST, no por URL; respuestas `no-store, private`. No cambia RLS, esquema, datos antiguos ni la respuesta del propósito fiscal `client_billing`.

## Evidencia

El simulador iPhone 17 Pro/Safari recibió la identificación ficticia mediante su teclado en pantalla. Al salir del campo se completaron nombre, correo y teléfono desde una cotización temporal del profesional. Se cerró sin crear otro cliente; se eliminó únicamente esa cotización temporal después de comparar su contenido exacto. Captura: `research/2026-11-05/client-identification/simulator-autocomplete.png`.

La validación cubre ES/EN en WebKit y Chromium móviles, ficha archivada e historial intactos, contactos de cotización propia, conservación de entrada manual, retiro de datos anteriores al cambiar ID, borrador tras recarga, caída de consulta y guardado posterior. Contratos adicionales verifican sesión/origen, permisos, cuota, parámetros extra, selección por propietario y ausencia de lectura global de perfiles. Se amplía a formularios de clientes, productos, citas y cotizaciones por compartir BusinessPanel y Modal. No se certifica un binario nativo ni se afirma haber probado cada pantalla de toda la aplicación.

## Cierre de validación

4/4 recorridos ES/EN de clientes y 2/2 contratos de teclado en WebKit/Chromium móviles; 2/2 regresiones de formularios (clientes, productos, citas y cotizaciones); 7/7 contratos de acceso/seguridad de identificación. Tipos, lint focal y diff sin errores. Entradas y logs finales en `research/2026-11-05/client-identification/inputs.json`.

Conservación: 78 tablas y 626 filas originales idénticas, 51 filas de ejemplos registrados conservadas, sin nuevos registros operativos ajenos a los ejemplos. Se limpiaron tres cuentas desechables exactas que quedaron tras interrumpir ejecuciones, verificando que no pertenecían a la base original y usando el helper existente. Las cuotas antiabuso nuevas se registran por separado y se dejan expirar por su mantenimiento normal; no se desactivaron ni borraron para superar límites. El comparador previo queda intacto; `/tmp/pro-client-id-preservation.cjs` agrega únicamente esa excepción exacta para cuotas efímeras, sin relajar las comparaciones de datos originales.
