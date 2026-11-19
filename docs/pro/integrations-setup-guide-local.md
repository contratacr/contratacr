# Guía para activar las integraciones (Hacienda, cobros, firma electrónica, correo/calendario, contabilidad, IA, transcripción, sitio web, campañas, anuncios, catálogo y escaneo)

Rondas 6A, 6B, 6C y 6D, 13 de noviembre de 2026. Rama local `local/pro-suite-no-push`. Guía para Isaac, en lenguaje sencillo.

## Resumen

Ya está programado todo lo necesario para emitir comprobantes electrónicos de Hacienda (versión 4.4) y cobrar con enlaces de pago (tarjeta y SINPE Móvil). Por ahora todo funciona en **simulación local**: se prueba el recorrido completo sin enviar nada a Hacienda ni a ningún procesador. Las piezas reales ya están escritas, pero se quedan apagadas hasta que usted cree las cuentas de prueba y ponga las claves en el servidor.

| Modo | Qué hace la aplicación | Cuándo se usa |
|---|---|---|
| **Simulación local** (`mock`) | Genera el XML v4.4 completo, lo firma con una firma **simulada** y un «Hacienda simulado» lo acepta o lo rechaza según datos de prueba. Los cobros los aprueba un «procesador simulado» con tarjetas de prueba. Nada sale de la computadora. Los comprobantes dicen «SIMULACIÓN LOCAL — sin validez fiscal». | Siempre que no haya claves. Es el modo predeterminado. |
| **Pruebas del proveedor** (`sandbox`) | Usa el ambiente de pruebas real de Hacienda (`recepcion-sandbox`) o de Tilopay, con su llave criptográfica y usuario de pruebas. Sin validez fiscal ni dinero real. | Solo si usted lo elige en Empresa › Integraciones **y** el servidor tiene todas las variables de ese modo. Si falta una, la emisión o el cobro se detienen con el aviso «Faltan claves en el servidor» (nunca se usa la simulación a escondidas). |
| **Producción** | Comprobantes con validez fiscal y cobros reales. | **Nunca se activa sola.** Requiere, al mismo tiempo: (1) la variable `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1` en el servidor, (2) que usted elija «Producción» y escriba `ACTIVAR PRODUCCION`, y (3) su autorización expresa para esa activación concreta. Sin la variable, el servidor la rechaza. |

Las claves **solo** van en variables de entorno del servidor. Nunca en la base de datos, en el código, en la pantalla ni en un correo. La pantalla de Integraciones solo muestra el **nombre** de cada variable y si está configurada o no.

## 1. Hacienda (factura electrónica, tiquete y nota de crédito)

### Crear el acceso de pruebas
1. Entre al **ATV** (Administración Tributaria Virtual) con la identificación del emisor que va a facturar.
2. Vaya a «Comprobantes electrónicos» y genere la **llave criptográfica de pruebas** (archivo `.p12`) y su **PIN**. Llega al buzón electrónico del ATV. Guárdelos fuera de la carpeta del proyecto.
3. En la misma sección genere la **contraseña de pruebas del API de recepción**. El usuario tiene la forma `cpf-01-1234-5678@stag.comprobanteselectronicos.go.cr` (física) o `cpj-3-101-123456@stag.comprobanteselectronicos.go.cr` (jurídica).
4. Confirme con su contador el **código de actividad económica** (6 dígitos), la ubicación (provincia, cantón y distrito según el Registro Único Tributario) y los códigos CAByS de sus servicios.

### Variables del servidor (modo pruebas)
| Variable | Qué poner |
|---|---|
| `PRO_HACIENDA_SANDBOX_USERNAME` | Usuario del API de pruebas (paso 3) |
| `PRO_HACIENDA_SANDBOX_PASSWORD` | Contraseña del API de pruebas |
| `PRO_HACIENDA_SANDBOX_P12_PATH` | Ruta completa del archivo `.p12` de pruebas en el servidor |
| `PRO_HACIENDA_SANDBOX_P12_PIN` | PIN de esa llave |
| `PRO_HACIENDA_SANDBOX_TOKEN_URL` (opcional) | Solo si Hacienda cambia la dirección del token. Predeterminada: `https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token` |
| `PRO_HACIENDA_SANDBOX_CLIENT_ID` (opcional) | Predeterminado `api-stag` |
| `PRO_HACIENDA_SANDBOX_API_URL` (opcional) | Predeterminada `https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1/` |

Para producción son las mismas cuatro con `PROD` en lugar de `SANDBOX` (`PRO_HACIENDA_PROD_USERNAME`, `…_PASSWORD`, `…_P12_PATH`, `…_P12_PIN`), con la llave y contraseña de **producción** del ATV.

### Pasar a modo pruebas
1. Ponga las variables en el archivo de entorno del servidor local (no en el repositorio) y reinicie el servidor.
2. En **Empresa › Integraciones › Hacienda** abra «Variables del servidor»: las cuatro deben decir «configurada».
3. Elija «Pruebas del proveedor». El estado debe quedar «Listo». Pulse **Probar conexión**: en pruebas solo se autentica con Hacienda (no envía ningún comprobante).
4. Complete **Datos del emisor para Hacienda** (identificación, nombre, actividad, ubicación, correo, sucursal `001`, terminal `00001`, «Proveedor de sistemas»: su propia identificación si el sistema es propio).
5. En un borrador: «Editar detalle de factura» (cada línea con CAByS, unidad e IVA), condición de venta y medio de pago; luego **Comprobante electrónico › Emitir factura** (o tiquete). Use «Consultar estado» hasta ver «Aceptado» o «Rechazado».

### Qué hace la aplicación
- Valida todo **antes** de reservar el consecutivo (CAByS de 13 dígitos, IVA definido, identificación del receptor según su tipo, medio de pago, datos del emisor, totales iguales al borrador).
- Reserva el consecutivo de 20 dígitos y compone la clave de 50 en la base (sin saltos por sucursal, terminal y tipo).
- Genera el XML v4.4 en el orden de los «Anexos y Estructuras v4.4», lo firma (XAdES-EPES, RSA-SHA256, política de Hacienda) con la llave `.p12`, lo envía y guarda la respuesta.
- Estados: Reservado → Firmado → Enviado → Recibido → Aceptado / Rechazado; si el envío falla queda en «Error» y se reintenta con espera creciente (30 s, 1 min, 2 min… hasta 1 h).
- Un borrador emitido queda **bloqueado**; se corrige con **nota de crédito** (anular todo o acreditar líneas). Un comprobante rechazado libera el borrador y el siguiente toma un consecutivo nuevo.
- Descargas: `clave.xml` (firmado), `clave_respuesta.xml` y la representación imprimible (guardar como PDF).

### Datos de prueba de la simulación
- Receptor con identificación **999999999** → Hacienda simulado **rechaza** («receptor no inscrito»).
- Receptor **888888888** → el primer envío falla (503) y el reintento se acepta.
- Cualquier otro receptor (o tiquete sin receptor) → **aceptado**.

## 2. Cobros en línea (tarjeta y SINPE Móvil) — Tilopay

Se eligió **Tilopay** para el adaptador de pruebas porque es un procesador costarricense con documentación pública de su API (`https://tilopay.com/developers/openapi.json`), acepta tarjetas y SINPE Móvil y tiene modo de prueba en la misma dirección (`https://app.tilopay.com`). El adaptador es genérico: otro procesador (por ejemplo, el de un banco) se conecta escribiendo un adaptador con las mismas funciones.

### Crear la cuenta de pruebas
1. Cree una cuenta de comercio en Tilopay y active el **modo de prueba**.
2. En «Integraciones de plataforma» copie el **usuario de API**, la **contraseña de API** y la **llave de integración** (key).
3. Pida a Tilopay (sac@tilopay.com) la especificación del aviso (webhook) de `processPayment`: no es pública. Mientras tanto, la aplicación **confirma cada pago consultando el API** (`/api/v1/consult`) antes de registrarlo; nunca registra dinero solo porque llegó un aviso.

### Variables del servidor
| Variable | Qué poner |
|---|---|
| `PRO_TILOPAY_SANDBOX_API_USER` | Usuario de API (modo prueba) |
| `PRO_TILOPAY_SANDBOX_API_PASSWORD` | Contraseña de API |
| `PRO_TILOPAY_SANDBOX_API_KEY` | Llave de integración |
| `PRO_TILOPAY_API_URL` (opcional) | Predeterminada `https://app.tilopay.com` |

Producción: `PRO_TILOPAY_PROD_API_USER`, `…_API_PASSWORD`, `…_API_KEY`.

### Pasar a modo pruebas
1. Ponga las variables y reinicie el servidor.
2. En **Empresa › Integraciones › Tilopay** confirme que dicen «configurada», elija «Pruebas del proveedor» y escriba en «Opciones de cobro» el teléfono SINPE Móvil que verán sus clientes (no es secreto).
3. Antes de cobrar con dinero de prueba, revise junto con el equipo los nombres de campos del sandbox de Tilopay (la parte real del adaptador está escrita según la documentación pública y **no se ha probado contra Tilopay**).

### Qué hace la aplicación
- Desde un borrador vinculado a un trabajo (**Cobro en línea**) o desde una cuota del **Plan de pagos** (**Enlace de pago**) crea un enlace por el saldo pendiente. El enlace se muestra **una sola vez** (solo se guarda su huella); usted lo envía por WhatsApp o correo.
- El cliente abre `/pagar` sin cuenta, paga con tarjeta (los datos de la tarjeta no se guardan; solo los últimos 4 dígitos) o con SINPE Móvil (envía el monto al teléfono indicado con el código `CCR-XXXXXX` y escribe el número de comprobante).
- El pago se registra en el estado de cuenta **una sola vez** cuando llega el evento del procesador, aunque el aviso se repita. Un reembolso registra la **anulación** del abono (no se borra nada).
- **Empresa › Cobros en línea** concilia lo recibido con lo registrado y marca «Revisar» si algo no coincide (por ejemplo, el saldo cambió antes de registrar): ahí se reembolsa o se registra a mano.

### Datos de prueba de la simulación
- Tarjeta **4242 4242 4242 4242** → aprobada.
- **4000 0000 0000 0002** → rechazada. **4000 0000 0000 9995** → fondos insuficientes.
- **4000 0000 0000 3220** → pide verificación del banco: «Aprobar» la aprueba, «Rechazar» la rechaza.
- SINPE: cualquier comprobante de 8 a 25 dígitos se confirma; si empieza con **000** no se encuentra.

**SINPE con Tilopay real (corrección del 2026-11-13):** el número de orden que se consulta a Tilopay es el que **genera el servidor** (`ccr_sinpe_…`) y se guarda con el intento antes de preguntar; nunca el identificador que manda el navegador. La consulta (`/api/v1/consult`) solo cuenta como pagada si Tilopay devuelve el **mismo monto y la misma moneda (CRC)** del enlace; si no, el intento queda «fallido» con el motivo `amount_mismatch` (el mismo que usa la bandeja de avisos, que además no registra un aviso con otro monto). Antes de activar el modo real falta: confirmar en el sandbox los nombres de los campos de la respuesta (`code`, `amount`, `currency`, `orderNumber`) y crear la orden SINPE en Tilopay con ese mismo número de orden al abrir la página de pago.

## 3. Lista para salir a producción de Hacienda y cobros (requiere su autorización para cada activación)

Ninguna de estas activaciones se hace sin su «sí» expreso y por escrito para ese proveedor y ese momento.

1. **Contador:** revisó actividad económica, CAByS, IVA y exoneraciones de sus servicios y aprobó un comprobante de pruebas aceptado por Hacienda.
2. **Pruebas superadas en sandbox:** factura aceptada, tiquete aceptado, nota de crédito aceptada, un rechazo y un reintento después de una caída; cobro aprobado, rechazado, con verificación del banco, SINPE, reembolso y conciliación sin «Revisar».
3. **Llaves de producción** generadas en el ATV y en Tilopay, guardadas solo en el servidor (variables `…_PROD_…`), con acceso restringido y copia segura del `.p12`.
4. **Contrato y comisiones** de Tilopay aceptados; cuenta bancaria de depósito verificada.
5. **Consecutivo:** si ya emitía comprobantes con otro sistema, configure la sucursal/terminal para **continuar la numeración** (Hacienda exige no repetirla).
6. **Política de datos** publicada (qué se guarda: comprobantes, respuestas y últimos 4 dígitos; nunca la tarjeta completa).
7. **Despliegue:** estas rutas hoy funcionan solo en desarrollo (`NODE_ENV=development`). Habilitarlas en producción es un cambio de código aparte, revisado y autorizado; esta rama no se publica.
8. **Activación:** poner `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, reiniciar, elegir «Producción» y escribir `ACTIVAR PRODUCCION`. Emitir **un** comprobante y **un** cobro pequeño de control, verificar en el ATV y en Tilopay, y solo entonces usarlo con clientes.
9. **Vuelta atrás:** cambiar el modo a «Simulación local» o quitar la variable de producción detiene de inmediato los envíos reales (los comprobantes ya aceptados se conservan).

---

# Ronda 6B: firma electrónica, correo y calendario, y contabilidad

Todo lo nuevo sigue las mismas reglas de arriba: **simulación local por defecto**, modo de pruebas solo cuando el servidor tiene **todas** las variables, y producción solo con `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1` + «ACTIVAR PRODUCCION» + su autorización expresa. Las cuatro integraciones nuevas aparecen como tarjetas en **Empresa › Integraciones** (Firma electrónica, Google, Microsoft y QuickBooks), con su modo, sus variables (solo nombre y «configurada / no configurada») y «Probar conexión».

## 4. Llave para guardar tokens cifrados (Google, Microsoft y QuickBooks)

Cuando un usuario conecta su cuenta de Google, Microsoft o QuickBooks, el proveedor entrega un «token» (una llave de acceso temporal). La aplicación **nunca lo guarda tal cual**: lo cifra con AES-256-GCM y la base de datos rechaza cualquier cosa que no venga cifrada. La llave de cifrado va en una variable del servidor:

| Variable | Qué poner |
|---|---|
| `PRO_OAUTH_TOKEN_KEY` | 32 bytes aleatorios en base64. Se genera una sola vez con `openssl rand -base64 32`. **No se cambia** después (si se cambia, todas las cuentas conectadas deben volver a conectarse). Guarde una copia segura fuera del servidor. |

En simulación se usa una llave fija de prueba que solo sirve para los tokens falsos del simulador; nunca abre un token real.

## 5. Firma electrónica (contratos, cotizaciones y órdenes de cambio)

### Cómo funciona hoy (simulación)
- En un **contrato compartido**, una **cotización compartida** (ventana «Cotización compartida») o un **cambio propuesto** aparece el recuadro **Firma electrónica** → «Pedir firma electrónica». Se congela una copia del documento (con su huella SHA-256) y se «envía» al firmante.
- En simulación no sale ningún correo: usted pulsa **«Abrir como firmante (simulación)»** y ve la página que vería el cliente: al abrirla queda «Abierta por quien firma»; el cliente escribe su nombre, acepta y pulsa **Firmar**, o escribe un motivo y pulsa **Rechazar**.
- Al firmar se guardan, sin posibilidad de cambiarlos ni borrarlos, el **PDF firmado** y el **certificado de auditoría** (huellas, fechas y horas de Costa Rica, quién hizo qué). Se descargan desde el mismo recuadro.
- Estados: Creada → Enviada → Abierta → Firmada / Rechazada / Vencida / Anulada. Usted puede anular mientras esté abierta y reintentar si el envío falló. Si el documento cambia, se envía una solicitud nueva (la anterior queda en el historial).
- **La aceptación con la cuenta del cliente sigue igual** y es la alternativa: si el cliente no usa la firma electrónica, puede aceptar desde su portal como hasta ahora.

### Qué proveedor y por qué
Se escribió el adaptador de pruebas para **DocuSign eSignature** porque: tiene un **entorno de pruebas gratuito** y público (cuenta de desarrollador, `demo.docusign.net`), una API documentada con avisos firmados (DocuSign Connect con HMAC), entrega el PDF firmado y el **certificado de finalización**, y se puede contratar desde Costa Rica. El adaptador está escrito según la documentación pública y **no se ha ejecutado contra DocuSign**. Cambiar a otro proveedor (por ejemplo uno local) es escribir otro adaptador con las mismas funciones (enviar, anular, descargar documentos, verificar avisos).

### Firma Digital de Costa Rica (BCCR) — importante
- En Costa Rica la **Ley 8454** (Ley de Certificados, Firmas Digitales y Documentos Electrónicos) da a la **firma digital certificada** —la de la tarjeta de Firma Digital emitida bajo la jerarquía del **Banco Central (CA SINPE)** y supervisada por la Dirección de Certificadores de Firma Digital del **MICITT**— el mismo valor que la firma manuscrita.
- Una firma electrónica como la de DocuSign (nombre escrito + evidencia y certificado de auditoría) **no es** esa firma digital certificada. Puede servir como prueba de aceptación, pero no tiene esa presunción legal automática.
- Si para algunos contratos se necesita la firma digital certificada, la opción práctica es que el cliente firme el PDF con su **tarjeta de Firma Digital** (aplicación «Firmador» del BCCR) y se adjunte el PDF firmado; validar esas firmas dentro de la aplicación queda como trabajo futuro.
- **La validez legal de cualquier opción debe confirmarla un abogado** antes de usarla con clientes (tipo de contrato, montos, si el cliente es consumidor, conservación de la evidencia).

### Crear la cuenta de pruebas (DocuSign)
1. Cree una cuenta gratuita de desarrollador en `https://developers.docusign.com` («Create developer account»).
2. En **Admin › Apps and Keys** cree una app: copie la **Integration Key**; en «Authentication» genere un **par de llaves RSA** y guarde la llave privada en un archivo fuera del proyecto.
3. En la misma página copie el **User ID** (API Username, un GUID) y el **API Account ID**.
4. Dé el permiso una vez (consentimiento JWT): abra en el navegador `https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=<Integration Key>&redirect_uri=<una URL de su app registrada en la app>` y acepte.
5. En **Settings › Connect** cree una **clave HMAC** (Connect Keys) y cópiela. La aplicación pide los avisos (eventos de sobre enviado, abierto, firmado, rechazado y anulado) en `https://<su dominio>/api/pro/integrations/webhooks/esign` y verifica la cabecera `X-DocuSign-Signature-1`.

### Variables del servidor (modo pruebas)
| Variable | Qué poner |
|---|---|
| `PRO_DOCUSIGN_SANDBOX_INTEGRATION_KEY` | Integration Key (paso 2) |
| `PRO_DOCUSIGN_SANDBOX_USER_ID` | User ID / API Username (paso 3) |
| `PRO_DOCUSIGN_SANDBOX_ACCOUNT_ID` | API Account ID (paso 3) |
| `PRO_DOCUSIGN_SANDBOX_PRIVATE_KEY_PATH` | Ruta completa del archivo de la llave privada RSA en el servidor |
| `PRO_DOCUSIGN_SANDBOX_CONNECT_HMAC` | Clave HMAC de Connect (paso 5) |
| `PRO_DOCUSIGN_SANDBOX_BASE_URL` (opcional) | Predeterminada `https://demo.docusign.net` |

Producción: las mismas con `PROD` (`PRO_DOCUSIGN_PROD_INTEGRATION_KEY`, `…_USER_ID`, `…_ACCOUNT_ID`, `…_PRIVATE_KEY_PATH`, `…_CONNECT_HMAC`) y además `PRO_DOCUSIGN_PROD_BASE_URL` (la dirección de su cuenta, por ejemplo `https://na3.docusign.net`; DocuSign la indica al pasar a producción tras su revisión «Go-Live»).

### Pasar a modo pruebas
1. Ponga las variables, reinicie el servidor y en **Empresa › Integraciones › Firma electrónica** confirme que todas dicen «configurada».
2. Elija «Pruebas del proveedor». Envíe un contrato de prueba a **su propio correo**: DocuSign le enviará el correo de firma de su entorno de pruebas (sin validez legal).
3. Revise que el estado avance solo (por los avisos de Connect) y que al firmar aparezcan el PDF firmado y el certificado.

## 6. Correo, calendario y archivos — Google (Gmail, Calendar, Drive)

### Cómo funciona hoy (simulación)
- **Empresa › Correo y calendario** → «Conectar cuenta» abre una pantalla de permiso **simulada**; al «Permitir» la cuenta queda conectada (con token cifrado). «Cancelar» no guarda nada.
- **Correo de proyecto**: escriba destinatarios, asunto, mensaje, elija el proyecto y adjunte archivos de **Drive** (selector simulado). Al pulsar «Revisar y enviar» la aplicación **siempre pide confirmar ese correo**. En simulación el correo **no se envía**: queda en la **Bandeja de salida** como «Simulado · no enviado».
- **Calendario (dos sentidos)**: «Sincronizar» envía al calendario los trabajos programados de la Agenda y las tareas con fecha. Si en el calendario se mueve una **tarea**, su fecha se trae a ContrataCR. Si se mueve una **cita con cliente**, o algo cambió en los dos lados, queda un **conflicto** y usted elige qué versión conservar (las citas con clientes solo se cambian desde Citas). Los eventos personales del calendario aparecen como «Ocupado». En simulación hay botones para imitar cambios hechos en el calendario.
- **Desconectar** revoca el permiso y borra los tokens; los correos y la sincronización ya registrados se conservan.

### Crear el acceso de pruebas
1. En `https://console.cloud.google.com` cree un proyecto (por ejemplo «ContrataCR Pro pruebas»).
2. En «APIs y servicios › Biblioteca» active **Gmail API**, **Google Calendar API**, **Google Drive API** y **Google Picker API**.
3. En «Pantalla de consentimiento de OAuth» elija **Externo**, deje el estado en **Prueba (Testing)** y agregue como **usuarios de prueba** las cuentas de Gmail con las que va a probar. Permisos que pide la aplicación: `openid`, `email`, `gmail.send`, `calendar.events` y `drive.file` (solo los archivos que el usuario elige).
4. En «Credenciales» cree un **ID de cliente de OAuth** de tipo «Aplicación web» con el URI de redirección `http://127.0.0.1:3185/api/pro/oauth/callback` (local) y luego el de su dominio (`https://<dominio>/api/pro/oauth/callback`). Copie el **ID de cliente** y el **secreto**.
5. Aviso: para usarlo con clientes reales (fuera de «Testing»), Google exige **verificar la app**; `gmail.send` es un permiso sensible y la verificación puede pedir política de privacidad, dominio verificado y revisión de seguridad. Tómelo en cuenta en tiempos.

### Variables del servidor
| Variable | Qué poner |
|---|---|
| `PRO_GOOGLE_OAUTH_SANDBOX_CLIENT_ID` | ID de cliente (paso 4) |
| `PRO_GOOGLE_OAUTH_SANDBOX_CLIENT_SECRET` | Secreto del cliente |
| `PRO_OAUTH_TOKEN_KEY` | Llave de cifrado (sección 4) |

Producción: `PRO_GOOGLE_OAUTH_PROD_CLIENT_ID`, `PRO_GOOGLE_OAUTH_PROD_CLIENT_SECRET` (cliente de la app ya verificada) y la misma `PRO_OAUTH_TOKEN_KEY`.

### Pasar a modo pruebas
1. Ponga las variables y reinicie. En **Empresa › Integraciones › Google** elija «Pruebas del proveedor».
2. En **Empresa › Correo y calendario** pulse «Conectar cuenta» con un usuario de prueba. Envíe un correo **a usted mismo** y sincronice un calendario de prueba antes de usar su calendario real.

## 7. Correo, calendario y archivos — Microsoft (Outlook, Calendario y OneDrive)

Funciona igual que Google (sección 6) con una cuenta de Microsoft 365 o Outlook.com.

### Crear el acceso de pruebas
1. En `https://entra.microsoft.com` › «Registros de aplicaciones» › «Nuevo registro». Tipos de cuenta: «Cuentas de cualquier directorio organizativo y cuentas personales de Microsoft».
2. URI de redirección tipo **Web**: `http://127.0.0.1:3185/api/pro/oauth/callback` (y luego el de su dominio).
3. En «Certificados y secretos» cree un **secreto de cliente** y copie su **valor** (solo se ve una vez). Copie también el **Id. de aplicación (cliente)**.
4. En «Permisos de API › Microsoft Graph › Permisos delegados» agregue: `openid`, `email`, `offline_access`, `Mail.Send`, `Calendars.ReadWrite` y `Files.Read`.
5. Para pruebas aisladas puede usar un inquilino de desarrollador de Microsoft 365.
6. Microsoft no tiene un servicio para «revocar» un token desde la aplicación: al **Desconectar**, ContrataCR borra los tokens; el usuario puede quitar el permiso en `https://myapps.microsoft.com` (cuenta de trabajo) o `https://account.live.com/consent/Manage` (cuenta personal).

### Variables del servidor
| Variable | Qué poner |
|---|---|
| `PRO_MICROSOFT_OAUTH_SANDBOX_CLIENT_ID` | Id. de aplicación (cliente) |
| `PRO_MICROSOFT_OAUTH_SANDBOX_CLIENT_SECRET` | Valor del secreto |
| `PRO_OAUTH_TOKEN_KEY` | Llave de cifrado (sección 4) |
| `PRO_MICROSOFT_OAUTH_TENANT` (opcional) | Predeterminado `common` (cualquier cuenta). Use el Id. de su inquilino para limitarlo a su organización. |

Producción: `PRO_MICROSOFT_OAUTH_PROD_CLIENT_ID`, `PRO_MICROSOFT_OAUTH_PROD_CLIENT_SECRET` y la misma llave. Para cuentas de otras organizaciones Microsoft puede pedir **verificación del editor** (publisher verification).

## 8. Contabilidad — QuickBooks Online y exportación CSV

### Cómo funciona hoy (simulación)
- **Empresa › Contabilidad** → «Conectar QuickBooks» (permiso simulado de Intuit, empresa de prueba `9130350000000001`).
- **Mapeo contable**: elija el artículo/cuenta de ingresos, la cuenta de depósito de los pagos y, para cada IVA de Costa Rica (13 %, 4 %, 2 %, 1 %, 0,5 %, exento, 0 %), el código de impuesto de QuickBooks. Elija si se sincronizan **solo facturas aceptadas por Hacienda** (predeterminado) o también **borradores internos**. Si falta algo del mapeo, la sincronización no arranca y dice qué falta.
- **Sincronizar ahora** envía clientes → facturas → pagos aplicados. Si solo cambió QuickBooks (por ejemplo su contador corrigió algo allá), se **conserva lo de QuickBooks**. Si cambió en los **dos lados**, queda un **conflicto** y no se sobrescribe nada hasta que usted elige «Conservar ContrataCR» o «Conservar QuickBooks».
- **Exportar CSV** (para cualquier sistema contable o para su contador): facturas (una fila por factura, base e IVA por tarifa, número y clave de Hacienda), pagos o clientes; formato **Excel Costa Rica** (punto y coma, coma decimal) o **CSV estándar**; filtro por fechas. Es la opción si no usa QuickBooks.

### ¿Se usa QuickBooks en Costa Rica?
QuickBooks Online se vende internacionalmente, pero no tiene una versión costarricense con IVA y comprobantes de Hacienda incorporados: por eso los códigos de IVA se **mapean a mano** y la factura oficial sigue siendo la de Hacienda (QuickBooks recibe una copia contable). Confírmelo con su contador; si su contador usa otro sistema local, la **exportación CSV** es la vía recomendada.

### Crear el acceso de pruebas
1. Cree una cuenta en `https://developer.intuit.com` y una **app** con el permiso **Accounting** (`com.intuit.quickbooks.accounting`).
2. En «Keys & credentials › Development» copie el **Client ID** y el **Client Secret** y agregue el URI de redirección `http://127.0.0.1:3185/api/pro/oauth/callback`.
3. Con la cuenta de desarrollador viene una **empresa de prueba (sandbox company)**; cree en ella un artículo de servicio (para ingresos), una cuenta de banco (para depósitos) y los códigos de impuesto que vaya a usar.

### Variables del servidor
| Variable | Qué poner |
|---|---|
| `PRO_QUICKBOOKS_SANDBOX_CLIENT_ID` | Client ID de Development |
| `PRO_QUICKBOOKS_SANDBOX_CLIENT_SECRET` | Client Secret de Development |
| `PRO_OAUTH_TOKEN_KEY` | Llave de cifrado (sección 4) |

Producción: `PRO_QUICKBOOKS_PROD_CLIENT_ID`, `PRO_QUICKBOOKS_PROD_CLIENT_SECRET` (las «Production keys» se entregan después del cuestionario de evaluación de Intuit).

### Pasar a modo pruebas
1. Ponga las variables y reinicie. En **Empresa › Integraciones › QuickBooks** elija «Pruebas del proveedor».
2. En **Empresa › Contabilidad** conecte la empresa de prueba, complete el mapeo y sincronice. Revise en QuickBooks (sandbox) que clientes, facturas y pagos coincidan con ContrataCR.

## 9. Lista para salir a producción de las integraciones de la Ronda 6B

**Cada proveedor se activa por separado y solo con el «sí» expreso y por escrito de Isaac para ese proveedor y ese momento.**

### Firma electrónica
1. **Abogado:** revisó qué documentos pueden firmarse con firma electrónica y cuáles necesitan Firma Digital certificada (Ley 8454), el texto de consentimiento de la página de firma y cuánto tiempo se conservan las evidencias.
2. **Pruebas en el sandbox de DocuSign:** enviado, abierto, firmado (PDF + certificado descargados), rechazado, vencido y anulado; un aviso repetido no cambia nada.
3. **Contrato con DocuSign** y revisión «Go-Live» aprobada; variables `…_PROD_…` solo en el servidor; llave privada con acceso restringido.
4. Aviso al cliente en la página de firma sobre el uso de su correo y nombre.

### Google y Microsoft
1. App **verificada** por Google (pantalla de consentimiento publicada) / verificación del editor en Microsoft si aplica.
2. Política de privacidad publicada que explique qué permisos se usan y que los tokens se guardan cifrados.
3. Pruebas con usuarios de prueba: conectar, enviar un correo a sí mismo (con confirmación), sincronizar calendario en ambos sentidos, conflicto resuelto, adjuntar archivo, desconectar.
4. `PRO_OAUTH_TOKEN_KEY` de producción generada, guardada con copia segura y sin cambiar después.

### QuickBooks
1. **Contador:** aprobó el mapeo (cuentas e IVA) y si se sincronizan solo facturas aceptadas por Hacienda.
2. Pruebas en la empresa sandbox: clientes, facturas con varias tarifas de IVA, pagos, una edición en QuickBooks (se conserva) y un conflicto resuelto.
3. Production keys de Intuit aprobadas; variables `…_PROD_…` solo en el servidor.

### Para todas
1. Las rutas siguen siendo **solo de desarrollo**; habilitarlas en producción es un cambio de código aparte, revisado y autorizado.
2. Poner `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, elegir «Producción» en la tarjeta del proveedor y escribir `ACTIVAR PRODUCCION`.
3. Hacer **una** operación de control (un sobre a su correo, un correo a sí mismo, una factura de prueba en QuickBooks) y revisarla en el proveedor antes de usarlo con clientes.
4. **Vuelta atrás:** volver a «Simulación local» o quitar la variable de producción detiene de inmediato las llamadas reales; lo ya firmado, enviado o sincronizado se conserva.


# Ronda 6C: asistente de IA y transcripción de audio

Desde la Ronda 6C hay dos proveedores más en **Empresa › Configuración › Integraciones**: **Asistente de IA · Anthropic Claude** y **Transcripción de audio**. Funcionan igual que los anteriores: **simulación local** por defecto (respuestas de ejemplo fijas, sin enviar nada a nadie), «Pruebas del proveedor» solo con la clave en el servidor y «Producción» solo con `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, `ACTIVAR PRODUCCION` y su autorización expresa.

Reglas que valen siempre, también con claves reales:

- **Autorización de tratamiento de datos por empresa, apagada por defecto.** Mientras esté apagada, toda llamada de IA o de transcripción se rechaza (también en simulación). Se activa en la tarjeta del asistente, que muestra el texto completo de la autorización y guarda la versión y la fecha.
- **Límite mensual de uso por empresa** (100 solicitudes por defecto, editable). Cada sugerencia, lectura de plano, comprobante, transcripción o resumen cuenta 1. Al llegar al límite se bloquea hasta el mes siguiente o hasta que usted lo amplíe. Reintentar la misma operación no cuenta dos veces.
- **Nada se guarda solo.** Todo resultado es una **sugerencia** con la etiqueta «Generado con IA»; usted la revisa y la edita, y se guarda solo cuando pulsa «Guardar» en el formulario de siempre (cotización, contrato, bitácora, avance, mediciones, gasto, notas de la reunión, tareas).
- **Datos mínimos y registro sin datos personales.** Al proveedor solo va lo necesario (por ejemplo, el servicio del trabajo y el primer nombre del cliente, sin correo ni teléfono). El registro técnico guarda solo conteos (caracteres, tamaño, tokens), nunca el texto, la foto ni el audio, y además oculta correos, teléfonos, cédulas y tarjetas.
- **Protección contra instrucciones escondidas** en documentos: el contenido de cotizaciones, recibos, planos y transcripciones se envía como **datos**, nunca como órdenes; la respuesta se valida contra un esquema fijo y se le quitan enlaces.
- Fotos de comprobantes y notas de voz **no se guardan**; las grabaciones de reuniones sí (privadas del dueño, se pueden borrar) y solo después de marcar que **todas las personas fueron informadas y dieron su consentimiento**.

## 10. Asistente de IA — Anthropic Claude

### Qué hace
- **Redactar:** descripción de una línea de cotización, cláusula de contrato, resumen de la bitácora del día y mensaje de avance para el cliente («✦ Sugerir con IA» junto a cada campo).
- **Leer planos:** en Mediciones, «✦ Leer plano con IA» propone áreas, longitudes y conteos como **borrador aproximado**; solo las filas que usted deja marcadas se crean como mediciones. No promete precisión estructural ni de ingeniería.
- **Gastos:** desde la foto de un comprobante o una nota de voz propone proveedor, fecha, monto, IVA y medio de pago y llena el formulario de gasto para que usted lo revise.
- **Reuniones:** con la transcripción propone resumen, decisiones y pendientes; los pendientes se pueden convertir en tareas del trabajo.

### Crear la cuenta
1. Entre a **console.anthropic.com** con un correo de la empresa y cree la organización (datos de facturación de la empresa).
2. Cree un **workspace** «ContrataCR pruebas» con un **límite de gasto mensual bajo** (por ejemplo, USD 10) y otro «ContrataCR producción» más adelante.
3. En el workspace de pruebas cree una **API key** y cópiela una sola vez a la variable del servidor (nunca en la base, en un correo ni en el código).
4. Revise y acepte los términos comerciales y la política de uso de datos vigentes de Anthropic (por defecto la API no usa sus datos para entrenar; confirme la retención aplicable en sus términos actuales).

### Variables del servidor
| Variable | Para qué | Obligatoria |
|---|---|---|
| `PRO_ANTHROPIC_API_KEY` | Clave del workspace (pruebas o producción). | Sí |
| `PRO_ANTHROPIC_MODEL` | Cambiar el modelo sin tocar el código (por defecto `claude-sonnet-5-5`; también se puede elegir en la tarjeta). | No |
| `PRO_ANTHROPIC_BASE_URL` | Solo si se usa un proxy corporativo. Por defecto `https://api.anthropic.com`. | No |

La aplicación llama a la Messages API (`POST /v1/messages`, cabecera `anthropic-version: 2026-10-21`) con salida JSON estructurada y, en los modelos que lo permiten, el respaldo automático del servidor ante un rechazo de seguridad.

### Costo aproximado (verifique los precios vigentes en anthropic.com/pricing)
Con `claude-sonnet-5-5` (USD 2 por millón de tokens de entrada y USD 10 por millón de salida a la fecha de esta guía):
| Uso | Tokens aprox. | Costo aprox. por uso |
|---|---|---|
| Sugerir un texto (línea, cláusula, bitácora, avance) | 1 500 entrada + 300 salida | USD 0,006 |
| Leer un comprobante | 2 000 + 300 | USD 0,007 |
| Leer un plano (imagen o una página PDF) | 3 000 + 1 000 | USD 0,02 |
| Resumir una reunión de 30 min (transcripción ya hecha) | 9 000 + 800 | USD 0,03 |

Con el límite predeterminado de 100 solicitudes al mes el gasto típico queda por debajo de USD 2 por empresa. El límite mensual de la aplicación es su primera barrera; el límite de gasto del workspace de Anthropic es la segunda.

### Pasar a modo pruebas
1. Ponga `PRO_ANTHROPIC_API_KEY` (workspace de pruebas) y reinicie el servidor.
2. En **Empresa › Integraciones › Asistente de IA** elija «Pruebas del proveedor». «Probar conexión» no gasta: la prueba real es la primera sugerencia; luego revise el **Registro técnico** (solo conteos, sin textos).
3. Pruebe con **datos ficticios** cada función (texto, plano, comprobante, reunión) y anote aciertos y errores antes de usarlo con clientes reales.

## 11. Transcripción de audio — API compatible con OpenAI

### Qué proveedor y por qué
Anthropic no transcribe audio, así que la transcripción es un proveedor aparte. Se programó el formato **«compatible con OpenAI» (`POST /v1/audio/transcriptions`)** porque lo ofrecen OpenAI y otros servicios; se cambia de proveedor con `PRO_TRANSCRIPTION_BASE_URL` y `PRO_TRANSCRIPTION_MODEL`, sin tocar el código. Recomendación inicial: OpenAI con el modelo `whisper-1` (o `gpt-4o-mini-transcribe` si se prefiere menor costo).

### Crear la cuenta
1. Cree la cuenta del proveedor elegido (por ejemplo, platform.openai.com) con datos de la empresa y ponga un **límite de gasto mensual**.
2. Cree una API key de un proyecto «ContrataCR pruebas» y póngala en el servidor.
3. Revise la política de datos del proveedor (uso para entrenamiento y retención del audio) y que permita audio con datos de clientes.

### Variables del servidor
| Variable | Para qué | Obligatoria |
|---|---|---|
| `PRO_TRANSCRIPTION_API_KEY` | Clave del proveedor de transcripción. | Sí |
| `PRO_TRANSCRIPTION_BASE_URL` | Otro proveedor compatible (por defecto `https://api.openai.com`). | No |
| `PRO_TRANSCRIPTION_MODEL` | Modelo (por defecto `whisper-1`; también en la tarjeta). | No |

### Costo aproximado (verifique los precios vigentes del proveedor)
Del orden de **USD 0,003 a 0,006 por minuto** de audio: una nota de voz de 30 segundos cuesta menos de un centavo; una reunión de 30 minutos, entre USD 0,09 y 0,18, más el resumen con Claude (sección 10). Límite de archivo en la aplicación: 8 MB.

### Texto de consentimiento
- **Empresa (tarjeta del asistente):** «Autorizo que ContrataCR envíe a los proveedores de IA y de transcripción configurados (Anthropic y el servicio de transcripción) solo los datos necesarios del trabajo, documentos, fotos o audio que yo elija para generar sugerencias. Las sugerencias no se guardan solas: las reviso y edito antes de guardarlas. Puedo retirar esta autorización en cualquier momento. Antes de grabar una reunión o llamada informaré a todas las personas participantes y obtendré su consentimiento.» (versión 2026-11-13).
- **Cada grabación:** «Confirmo que informé a todas las personas de la reunión o llamada que se está grabando y para qué, y que todas dieron su consentimiento.» Se guarda junto con la grabación y su fecha.
- Recomendación: decirlo también en voz alta al inicio de la grabación («esta reunión se graba para el expediente del proyecto; ¿están de acuerdo?»). Que un abogado revise el texto, la retención y el aviso de privacidad (Ley 8968 de Protección de la Persona frente al Tratamiento de sus Datos Personales).

## 12. Lista para salir a producción de IA y transcripción (requiere su OK para cada activación)

**Cada proveedor se activa por separado y solo con el «sí» expreso y por escrito de Isaac para ese proveedor y ese momento.** Sin ese OK nadie cambia el modo, pone la clave de producción ni la variable `PRO_INTEGRATIONS_ALLOW_PRODUCTION`.

1. **Evaluación en datos ficticios** (modo pruebas): al menos 20 casos por función (textos, planos, comprobantes, notas de voz, reuniones) con el porcentaje de aciertos anotado; los planos se comparan contra mediciones hechas a mano.
2. **Abogado:** aprobó el texto de autorización, el de consentimiento de grabación, el aviso de privacidad y cuánto tiempo se conservan las grabaciones.
3. **Costos:** límite de gasto en Anthropic y en el proveedor de transcripción, y límite mensual de la aplicación definido por empresa.
4. **Claves de producción** en workspaces/proyectos separados de los de pruebas, solo en el servidor.
5. Las rutas siguen siendo **solo de desarrollo**; habilitarlas en producción es un cambio de código aparte, revisado y autorizado.
6. Activar: `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, elegir «Producción» en la tarjeta y escribir `ACTIVAR PRODUCCION`. Hacer **una** sugerencia y **una** transcripción de control y revisar el registro técnico y el gasto en la consola del proveedor.
7. **Vuelta atrás:** apagar la autorización de la empresa, volver a «Simulación local» o quitar la variable detiene de inmediato toda llamada; lo ya revisado y guardado se conserva.


# Ronda 6D: sitio web, campañas por correo, seguimiento de anuncios, catálogo desde enlace y planos/escaneo

Estas herramientas son para que **cada profesional** promocione **su propio** negocio dentro de Pro. No tocan las cuentas de publicidad ni la configuración de correo/marketing de ContrataCR (el correo de ContrataCR sigue en `src/lib/email`, con su propia cuenta de Brevo; las campañas de los profesionales usan **otra** clave y otra cuenta). Todo está en **simulación local**: no se envía ningún correo, no se publica nada fuera de esta computadora, no se llama a Meta, Google, Brevo, Cloudflare ni a ninguna tienda. Los cinco proveedores nuevos aparecen en **Empresa › Configuración › Integraciones** con su «Probar conexión» simulado.

| Proveedor (id) | Para qué | Variables (solo nombres; nunca se crearon) |
|---|---|---|
| Correo de campañas · Brevo (`marketing_email`) | Enviar campañas y automatizaciones aprobadas | `PRO_MARKETING_BREVO_SANDBOX_API_KEY` (pruebas), `PRO_MARKETING_BREVO_API_KEY` (producción), opcional `PRO_MARKETING_BREVO_BASE_URL` |
| Meta Ads (`meta_ads`) | Importar el gasto diario de campañas (documentado, apagado) | `PRO_META_ADS_APP_ID`, `PRO_META_ADS_APP_SECRET`, `PRO_OAUTH_TOKEN_KEY` |
| Google Ads (`google_ads`) | Importar el costo diario (documentado, apagado) | `PRO_GOOGLE_ADS_DEVELOPER_TOKEN`, `PRO_GOOGLE_ADS_OAUTH_CLIENT_ID`, `PRO_GOOGLE_ADS_OAUTH_CLIENT_SECRET`, `PRO_OAUTH_TOKEN_KEY`, opcional `PRO_GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| Lector de páginas públicas (`product_clipper`) | «Agregar desde enlace» en Mis artículos | `PRO_CLIPPER_ENABLE_FETCH=1`, opcional `PRO_CLIPPER_USER_AGENT` |
| Dominio propio · Cloudflare for SaaS (`site_domain`) | Servir el sitio del profesional en su dominio | `PRO_CLOUDFLARE_ZONE_ID`, `PRO_CLOUDFLARE_API_TOKEN` |

## 13. Sitio web del profesional (Empresa › Marketing › Sitio web)

**Qué hace hoy (local):** el profesional arma su sitio con secciones que salen de sus propios datos de ContrataCR: portada, servicios (de su perfil), trabajos (solo fotos de **su** perfil; el servidor rechaza fotos de otro origen al publicar), reseñas **publicadas** de ContrataCR (las ocultas por moderación nunca salen; el nombre se reduce a nombre + inicial), zona de servicio y formulario de solicitud. Elige uno de cuatro estilos de ContrataCR (azul y celeste, cielo, noche, arena), título y descripción para buscadores. **Guardar borrador** no publica nada; **Vista previa** muestra el borrador con el formulario desactivado; **Publicar** congela una **versión numerada inmutable** que se sirve en `/sitio/<dirección>` (solo en desarrollo, ruta reservada como `/pagar` y el portal de licitaciones). Los cambios posteriores quedan en el borrador hasta la siguiente publicación. «Despublicar» lo retira; las versiones se conservan. Mapa del sitio local: `/api/pro/site-public?sitemap=1`.

**El formulario** crea un **cliente** y una **solicitud** en Solicitudes (centro de solicitudes existente) con origen «Sitio web» (o «Publicidad»/«Redes» si llegó por un enlace de campaña), una sola vez por envío (reintentar no duplica). La casilla de marketing es **opcional y desmarcada**: si la marca, se guarda el texto exacto que vio, la fecha y la versión del sitio.

**Dominio propio (no activo):** se puede anotar el dominio; conectarlo requiere Cloudflare for SaaS.
1. En Cloudflare, en la zona de ContrataCR, activar «Cloudflare for SaaS» y definir el destino (p. ej. `sitios.contratacr.com`).
2. Crear un token de API con permiso **solo** «SSL and Certificates: Edit» sobre esa zona → `PRO_CLOUDFLARE_API_TOKEN`; el id de zona → `PRO_CLOUDFLARE_ZONE_ID`.
3. El cliente apunta un CNAME de su dominio al destino; el certificado se emite solo (validación HTTP).
4. Falta programar (con su autorización): el cambio de enrutamiento que sirva `/sitio/<slug>` por nombre de host y el paso de las rutas de desarrollo a producción.

**Legal:** el sitio lo publica el profesional; ContrataCR es el proveedor. Revisar con un abogado los términos para profesionales (contenido, fotos con derechos, reseñas) y el aviso de privacidad del formulario (Ley 8968).

## 14. Campañas por correo y automatizaciones (Empresa › Marketing › Correo masivo)

**Qué hace hoy (local):** contactos con **consentimiento explícito** (desde la casilla del sitio web o registrado por el profesional con texto y cómo lo obtuvo: por escrito, formulario, de palabra u otro). Campañas con borrador, **prueba solo a su propio correo**, programación y envío a la audiencia con consentimiento (todos, solo clientes o solo solicitudes). Automatizaciones: «pedir reseña al terminar un trabajo» y «seguimiento de una cotización compartida sin respuesta»: solo **preparan borradores** que el profesional aprueba uno por uno. Todo queda en la **bandeja de salida** marcado «simulado»; las aperturas/clics que se ven están marcados **«Simulado — no son datos reales»**.

**Doble confirmación (corrección del 2026-11-13, configuración predeterminada):** marcar la casilla del sitio web **no** da el consentimiento: deja el contacto «pendiente» y prepara un correo de confirmación con un enlace personal de un solo uso (`/confirmar-pro#t=…`, vence en 7 días; en la base solo se guarda su huella SHA-256). Solo cuando la persona abre ese enlace y pulsa «Sí, confirmar» el contacto pasa a «con consentimiento». Abrir la página no confirma nada (los lectores de enlaces de los buzones no pueden confirmar por ella). En simulación ese correo **no se envía**: se guarda como «simulado» en una tabla que el profesional no puede leer (así nadie puede confirmar en nombre de otra persona). Si la misma dirección vuelve a marcar la casilla el mismo día no se manda otro correo. A una dirección dada de baja no se le manda nada y la respuesta del formulario es la misma que para cualquiera. El consentimiento que registra el profesional con texto y evidencia sigue igual (sin doble confirmación).

**Barreras que no dependen de la pantalla (en la base de datos):** un mensaje de campaña o automatización a alguien sin consentimiento vigente, **con la doble confirmación pendiente** o dado de baja se **rechaza** (aunque lo intente otro código); en simulación un mensaje solo puede quedar «simulado»; la prueba solo puede ir al correo de la cuenta; la lista de supresión es de solo agregar; quien se da de baja no puede ser agregado de nuevo desde la aplicación. Cada correo lleva un enlace de baja propio (`/baja-pro#t=…`; en la base solo se guarda su huella SHA-256) y, en el envío real, la cabecera `List-Unsubscribe` de un clic (RFC 8058): apunta a `/api/pro/marketing-unsubscribe/one-click?t=…` (el token va en la consulta porque un `#fragmento` no viaja en la petición), que acepta solo el cuerpo exacto `List-Unsubscribe=One-Click` desde el buzón (sin exigir el mismo origen), es idempotente, tiene límite de peticiones y responde igual con un token válido, usado o inventado. Abrirla con GET no da de baja: lleva a la página `/baja-pro`. Nota: el servidor real no debe guardar la consulta completa en sus registros de acceso.

### Ley 8968 (Protección de la Persona frente al Tratamiento de sus Datos Personales) — notas para revisar con abogado
- **Consentimiento informado, expreso y previo** para fines publicitarios (art. 5): por eso la casilla es opcional, desmarcada y con texto claro; el formulario usa **doble confirmación** por correo (prueba de que la dirección es de quien consiente); y el registro manual exige texto y evidencia.
- **Derecho a revocar** en cualquier momento, gratis y fácil (enlace en cada correo); la baja aplica a ese negocio.
- **Responsable del tratamiento:** el profesional (sus contactos); ContrataCR actúa como encargado/proveedor tecnológico. Conviene un contrato de encargo y que la PRODHAB pueda ver la base de datos si corresponde inscribirla (bases con fines de distribución/comercialización).
- **Finalidad limitada:** los datos del formulario se usan para responder la solicitud; solo con la casilla se usan para novedades.
- **Seguridad:** RLS, solo `service_role`, huellas en vez de tokens, historial inmutable.

### Cuenta y activación (cuando usted lo autorice)
1. Crear una cuenta de **Brevo** separada para campañas de profesionales (no la de ContrataCR). Verificar el dominio remitente (SPF, DKIM y DMARC) — p. ej. `campanas.contratacr.com`.
2. Crear una clave API de pruebas → `PRO_MARKETING_BREVO_SANDBOX_API_KEY`; en Integraciones elegir «Pruebas» para la tarjeta «Correo de campañas» y opcionalmente configurar remitente y tope por campaña.
3. Falta programar con su OK: el **despachador** que tome los mensajes «en cola» (modo real) y los entregue con `BrevoCampaignSender` (ya escrito y probado con un `fetch` falso), y el webhook de rebotes/quejas de Brevo que agregue a la supresión.

## 15. Seguimiento de anuncios y captación (Empresa › Marketing › Resultados de marketing)

**Qué hace hoy (local):** enlaces de seguimiento por campaña con UTM (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`) y un código `cc` que el formulario del sitio envía con la solicitud. Cada solicitud del sitio queda **atribuida** (primer contacto, inmutable) y con su origen en el centro de solicitudes; el profesional puede asignar a mano, una vez, una solicitud sin campaña. Costos por campaña anotados a mano (solo agregar; un error se corrige con una anulación). El reporte (visitas, solicitudes, ganadas, monto acordado, costo, costo por solicitud y ROI) sale **solo de datos reales** de la cuenta: solicitudes, conversiones (solicitud → trabajo vigente) y montos acordados de esos trabajos.

**Meta Ads y Google Ads (documentados, apagados):** el código de importación está descrito en `src/lib/pro/integrations/ads/stubs.ts` y no se ejecuta.
- **Meta:** app en developers.facebook.com con el producto Marketing API, permiso `ads_read`, revisión de la app por Meta; OAuth del profesional (token guardado cifrado como en la Ronda 6B). Lectura: `/act_<cuenta>/insights?fields=campaign_name,spend&time_increment=1`.
- **Google Ads:** token de desarrollador (solicitud a Google, nivel básico), proyecto OAuth con el alcance `adwords`, `customer_id` del profesional. Lectura: `metrics.cost_micros` por campaña y día.
- Solo se importa **gasto diario** (nada de audiencias ni datos personales) como líneas de costo con el mismo escritor.

## 16. Agregar desde enlace (Mis artículos) y extensión del navegador

**Qué hace hoy (local):** el profesional pega el enlace de un producto; el servidor devuelve **datos de ejemplo** (marcados «Simulado») leídos con el mismo analizador real de Open Graph y schema.org; respeta `robots.txt` (en la simulación, `bloqueado.example` lo demuestra). El profesional corrige nombre, código, costo y precio y **guarda con el escritor normal del catálogo**; nada se guarda solo. La extensión (`extensions/clipper/`, Manifest V3, no publicada, permiso `activeTab`) solo abre la aplicación con el enlace ya pegado.

**Activar el lector real (con su OK):** poner `PRO_CLIPPER_ENABLE_FETCH=1` y elegir «Pruebas» en la tarjeta. El lector: solo `https`, rechaza IP y nombres locales, lee primero `robots.txt` (si prohíbe, no visita la página; si el servidor falla, asume prohibido), solo `text/html` hasta 1,5 MB, 8 s de espera, y solo extrae metadatos públicos. Pendiente antes de producción: resolver DNS y bloquear rangos privados en el borde (protección SSRF completa), y revisar con un abogado el uso de datos de terceros (términos de cada tienda).

**Publicar la extensión:** cuenta de Chrome Web Store, íconos generados desde la marca oficial, política de privacidad propia y revisión de Google (ver `extensions/clipper/README.md`).

## 17. Planos 2D, vista 3D y escaneo de habitaciones (trabajo › Mediciones)

**Qué hace hoy (local):** editor de planos por trabajo: paredes con grosor, puertas y ventanas sobre una pared, ambientes con **área y perímetro automáticos** (también calculados y guardados por la base de datos), cotas, cuadrícula y escala, ambiente rectangular por medidas (sirve con teclado), exportar **PNG** y **PDF** vectorial, **vista 3D** de paredes extruidas (sin dependencias nuevas; arrastrar o botones para girar) y **«Enviar áreas a Mediciones»** (sube la imagen del plano a Archivos y crea una medición de área por ambiente con el escritor de Mediciones; queda registrado el vínculo). Es un dibujo de referencia para cotizar, no un plano estructural.

**Escaneo:** importar un archivo **JSON** (plano propio o exportación RoomPlan «CapturedRoom»: se lee exacto), **OBJ** (malla de cualquier app de escaneo: planta aproximada por el contorno) o **USDZ** (en local **simulado**: se comprueba el contenedor y se crea un rectángulo provisional claramente marcado). Se guarda la huella SHA-256 y el tamaño del archivo, no el archivo.

**Escaneo nativo (interfaz documentada, sin código nativo):** `src/lib/pro/room-scan-native.ts` define el complemento Capacitor `ContrataRoomScan` con `isSupported()` y `startScan({unit,language})` que devuelve el JSON de RoomPlan. En iOS 16+ con LiDAR usaría Apple RoomPlan (`RoomCaptureView`, `CapturedRoom` codificado con `JSONEncoder`); en Android, ARCore Depth (planos verticales con la misma forma JSON). El botón «Escanear con el teléfono» solo aparece si el complemento existe. Programarlo exige cambiar `ios/` y `android/` y una **compilación de tienda**: requiere su autorización expresa (y el registro en `docs/mobile-release-history.md`).

## 18. Lista para salir a producción de la Ronda 6D (requiere su OK para cada activación)

**Cada proveedor y cada función se activan por separado, solo con el «sí» expreso y por escrito de Isaac para esa activación.** Sin ese OK nadie pone claves, cambia el modo ni la variable `PRO_INTEGRATIONS_ALLOW_PRODUCTION`.

1. **Sitio web:** abogado revisó términos para profesionales y aviso del formulario; decidir si el sitio se sirve en `contratacr.com/sitio/<slug>` y/o dominio propio; habilitar las rutas en producción (cambio de código aparte); agregar los sitios publicados al `sitemap.ts` de producción.
2. **Correo de campañas:** cuenta Brevo separada, dominio verificado (SPF/DKIM/DMARC), texto de consentimiento y política aprobados por abogado (Ley 8968), despachador real y webhook de rebotes programados y probados en modo pruebas con direcciones propias; tope por campaña; luego `PRO_MARKETING_BREVO_API_KEY` y la activación.
3. **Anuncios:** apps de Meta/Google aprobadas por cada plataforma; prueba de importación con una cuenta propia; nunca subir datos de clientes a las plataformas.
4. **Lector de enlaces:** protección SSRF completa en el borde, prueba en modo pruebas con tiendas propias o con permiso; `PRO_CLIPPER_ENABLE_FETCH=1`.
5. **Dominio propio:** Cloudflare for SaaS activado, token con permiso mínimo, enrutamiento por nombre de host programado y probado con un dominio de prueba propio.
6. **Escaneo nativo:** complemento iOS/Android programado, compilación de tienda autorizada y registrada.
7. **Vuelta atrás:** volver la tarjeta a «Simulación local», quitar la clave o la variable detiene de inmediato todo envío/llamada; despublicar el sitio lo retira; lo ya guardado (versiones, consentimientos, bajas, costos) se conserva.
