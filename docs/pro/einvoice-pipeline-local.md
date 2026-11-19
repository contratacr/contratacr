# Factura electrónica detrás de un adaptador de proveedor (Ronda F2-A, 2026-11-19)

Fila 58 del [registro](houzz-parity-register-local.md). Amplía la emisión v4.4 de la Ronda 6A
([guía de integraciones](integrations-setup-guide-local.md), [investigación](electronic-invoicing-research.md)).
Pro sigue apagado en producción (`PRO_ENABLED=false`); las rutas responden 404 fuera de `next dev`.
**Hoy todo funciona solo en modo de prueba (`mock`)**: nada se envía a Hacienda, a GTI ni a ningún proveedor,
no se emite ningún comprobante real y no se usan credenciales reales.

## 1. Arquitectura

| Pieza | Archivo |
|---|---|
| Interfaz del proveedor (`issue`, `getStatus`, `cancel`, `receiverMessage`, `receiverStatus`) y resolución de modo | `src/lib/pro/einvoice/provider.ts` |
| Simulador local determinista de Hacienda (`mock`) | `src/lib/pro/einvoice/mock-provider.ts` |
| `hacienda-sandbox` y `gti` como stubs que se niegan sin configuración | `src/lib/pro/einvoice/stub-providers.ts` |
| Selección del adaptador por comprobante, re-export de `EinvoiceSigner` / `MockSigner` | `src/lib/pro/einvoice/index.ts` |
| Mensaje receptor (aceptación 05, parcial 06, rechazo 07) | `src/lib/pro/einvoice/receiver-message.ts` |
| Constructor v4.4 (FE 01, ND 02, NC 03, TE 04), clave, consecutivo, XML, firma | `src/lib/pro/integrations/hacienda/{document,clave,xml,signer,codes}.ts` |
| Orquestación (reserva → XML → firma → proveedor → respuestas) | `src/lib/pro/integrations/hacienda/service.ts` |
| Ruta del pipeline (dueño, Administrador, Gerente) | `src/app/api/pro/invoice-einvoice/route.ts` |
| Archivos (XML firmado, respuesta, impreso con marca, XML del mensaje receptor) | `src/app/api/pro/einvoice-file/route.ts` |
| SQL local | `docs/pro/sql/einvoice-pipeline-local.sql` (después de `einvoice-local.sql` en el manifiesto) |
| Pantallas | `invoice-einvoice.tsx` (borrador › Factura electrónica), `company-einvoice.tsx` (Empresa › Facturación electrónica), `einvoice-copy.ts` |

### Resolución del modo (igual que `src/lib/email/provider.ts`)
- **mock** — predeterminado y siempre que `PRO_EINVOICE_PROVIDER` no exista, sea `mock` o falte cualquier pieza.
- **sandbox** — `PRO_EINVOICE_PROVIDER=hacienda-sandbox|gti` + todas las variables de pruebas de ese proveedor.
- **live** — solo `PRO_EINVOICE_MODE=live` **y** `NODE_ENV=production` **y** `PRO_EINVOICE_LIVE_CONFIRMED=1` **y** las variables de producción.
- Un comprobante reservado en `mock` usa SIEMPRE el simulador; el modo y el proveedor quedan grabados en el comprobante
  y son inmutables. Además sigue vigente el candado de la Ronda 6A (`Empresa › Integraciones › Hacienda`: modo
  guardado + `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1` para producción). El código solo comprueba la **presencia** de
  las variables; nunca las imprime ni las devuelve.

### Simulador (`mock`): flujo asíncrono de Hacienda
Envío → `202 recibido`. Primera consulta → `procesando`. Siguiente consulta → `aceptado` (Mensaje 1) o `rechazado`
(Mensaje 3) con el motivo. Reenviar una clave ya conocida → `400 ya fue recibido` (se registra como recibido, nunca
un segundo comprobante). Datos de prueba:

| Dato | Resultado |
|---|---|
| Receptor `999999999` | Rechazado: receptor no inscrito en el padrón |
| Receptor `888888888` | Primer envío 503 (transitorio); el reintento entra |
| Receptor `777777777` | Primer envío sin respuesta a tiempo aunque Hacienda lo recibió; el reintento responde «ya recibido» |
| Receptor `666666666` | La 2.ª consulta devuelve `error` de procesamiento; la siguiente responde |
| CAByS `9999999999999` | Rechazado: código CAByS inexistente |
| Actividad `999999` | Rechazado: actividad no inscrita |
| Totales del XML que no cuadran, clave que no coincide con consecutivo o fecha | Rechazado con el motivo |
| XML sin firma | 400 al recibir (no transitorio) |
| Mensaje receptor de una clave con emisor `000999999999` | Rechazado: comprobante referido inexistente |

Toda respuesta simulada dice «SIMULACIÓN LOCAL — sin validez fiscal».

## 2. Datos (SQL `einvoice-pipeline-local.sql`)
- Nota de débito `02` contra una FE/TE **aceptada** del mismo borrador (código de referencia 02, mayor que cero, sin
  tope; rechazada si el original se anuló completo). El tope de las notas de crédito no cambia y ya no suma débitos.
- Estado `procesando` propio: `enviado → recibido → procesando → aceptado | rechazado`, `error` con reintento
  (espera 30 s, 60 s, … hasta 1 h) en cualquier paso no final; `aceptado`/`rechazado` son finales.
- `pro_einvoice_provider_responses`: una fila inmutable por llamada al proveedor (proveedor, modo, operación, intento,
  HTTP, resultado, estado, mensaje, SHA-256 del cuerpo). El XML queda en línea, congelado al firmarse, y se referencia
  por (`owner_id`, `clave`) + `signed_sha256`.
- Proveedor por emisor (`pro_einvoice_settings.provider`, predeterminado `mock`) y por comprobante.
- `pro_einvoice_receiver_messages` (+ historial): consecutivo propio 05/06/07 por sucursal/terminal, la clave recibida
  debe corresponder al emisor declarado, no se responde un comprobante propio, una sola respuesta vigente por
  comprobante recibido (una rechazada lo libera).
- Consecutivo sin saltos: `pro_einvoice_sequences` por emisor/sucursal/terminal/tipo, bajo el candado transaccional
  del emisor; una reserva rechazada se revierte entera y no consume número.
- `pro_einvoice_due_retries`: lista de reintentos vencidos (documentos y mensajes).
- Seguridad como los vecinos: RLS, sin permisos para `anon`/`authenticated`, solo `service_role`, `security invoker`,
  recibos idempotentes por `actionId`, historial y respuestas inmutables. La ruta deja pasar solo al dueño,
  Administrador y Gerente (`finance.write` en la puerta de equipo + `proInternalFinanceDenied`).

## 3. Campos a «validar con XSD oficial»
El XSD v4.4 no se pudo descargar (`cdn.comprobanteselectronicos.go.cr` responde 403 sin sesión). El orden y los
nombres siguen «Anexos y Estructuras v4.4»; antes de pasar a pruebas reales se deben validar contra el XSD oficial:
- `NotaDebitoElectronica`: raíz, espacio de nombres y que `InformacionReferencia/Codigo` 02 sea el adecuado para un cargo adicional.
- `MensajeReceptor`: orden de `CondicionImpuesto`, `MontoTotalImpuestoAcreditar`, `MontoTotalDeGastoAplicable`, y si
  `CodigoActividad` es obligatorio en 4.4; envío al ATV con `consecutivoReceptor` (todavía no implementado en el adaptador real).
- `CodigoTipoMoneda/TipoCambio` en USD (el borrador hoy es solo CRC; el constructor ya admite USD con 5 decimales).
- `MedioPago` 04 (transferencia) y 06 (SINPE Móvil) en la nota 6 vigente; `TotalDesgloseImpuesto` por tarifa.
- Redondeo: montos a 5 decimales (medio hacia afuera) por línea; `TotalComprobante = TotalVentaNeta + TotalImpuesto + TotalOtrosCargos − TotalIVADevuelto`.

## 4. Lo que el dueño debe entregar
**Para pruebas reales con Hacienda (sandbox):**
1. Usuario y contraseña del ATV de **pruebas** → `PRO_HACIENDA_SANDBOX_USERNAME`, `PRO_HACIENDA_SANDBOX_PASSWORD`.
2. Llave criptográfica `.p12` de **pruebas** y su PIN → `PRO_HACIENDA_SANDBOX_P12_PATH` (ruta en el servidor), `PRO_HACIENDA_SANDBOX_P12_PIN`.
3. `PRO_EINVOICE_PROVIDER=hacienda-sandbox` en el servidor y, en Empresa › Integraciones › Hacienda, el modo «Pruebas del proveedor».
4. Datos fiscales reales del emisor (cédula, nombre, actividad económica de 6 dígitos, ubicación, correo), sucursal y
   terminal, y si ya emitía con otro sistema, el último consecutivo usado por tipo.
5. Revisión del contador: CAByS, tarifas de IVA y exoneraciones de sus servicios; validación de los campos de la sección 3.
6. Su autorización explícita para la primera llamada real al ambiente de pruebas.

**Para GTI (si se elige como proveedor autorizado):** contrato firmado, documentación de su API, y
`PRO_GTI_SANDBOX_API_URL`, `PRO_GTI_SANDBOX_API_KEY`, `PRO_GTI_SANDBOX_COMPANY_ID` (producción: `PRO_GTI_API_URL`,
`PRO_GTI_API_KEY`, `PRO_GTI_COMPANY_ID`). Hasta tener el contrato el adaptador responde «no implementado».

**Para producción (live), además:** usuario, contraseña, `.p12` y PIN de producción
(`PRO_HACIENDA_PROD_USERNAME`, `PRO_HACIENDA_PROD_PASSWORD`, `PRO_HACIENDA_PROD_P12_PATH`, `PRO_HACIENDA_PROD_P12_PIN`),
`PRO_EINVOICE_MODE=live`, `PRO_EINVOICE_LIVE_CONFIRMED=1`, `PRO_INTEGRATIONS_ALLOW_PRODUCTION=1`, un comprobante de
pruebas aceptado, la aprobación del contador y su OK por escrito. Pro debe estar habilitado para su cuenta.

## 5. Pruebas
- `node scripts/pro/verify-einvoice-db.mjs` — contrato SQL (PGlite con el manifiesto completo, 7 grupos).
- `tests/e2e/pro-einvoice-unit.spec.ts` — constructor, clave, redondeo, ND, moneda, mensaje receptor, simulador y resolución (8 pruebas, sin navegador).
- `tests/e2e/pro-einvoice.spec.ts` — flujo completo ES/EN en `chromium-desktop` y `webkit-mobile`.
- `tests/e2e/pro-round6a-integrations.spec.ts` — actualizado al paso `procesando`.
