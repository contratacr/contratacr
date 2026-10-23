# Facturación electrónica: investigación inicial, 23 de octubre de 2026

## Decisión propuesta

Mantener cotizaciones e inventario independientes del proveedor fiscal. Primera
opción: adaptar GTI si el contrato del titular incluye integración y permite el
modelo de múltiples emisores. Tener una cuenta de facturación no acredita esas
condiciones. No se han solicitado ni usado credenciales, ni emitido documentos.

Alternativa: motor propio. Existe API oficial para recepción y consulta, por lo
que es técnicamente posible. No basta producir un PDF: requiere estructuras XML
vigentes, firma, autenticación, claves/consecutivos, catálogos fiscales, respuesta
asíncrona, rechazos, reintentos idempotentes, contingencias y conservación de
XML/documentos/respuestas. Cada profesional factura como su propio emisor; la
suscripción de ContrataCR constituye un flujo fiscal separado.

## Fuentes primarias consultadas

- Hacienda: https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html
  Describe recepción, consulta y OAuth/OIDC. Recibido no equivale a aceptado.
- Hacienda: https://www.hacienda.go.cr/docs/ComprobantesElectronicos-GeneralidadesyVersion4.4.marzo2025.pdf
  Presenta versión 4.4. Deben descargarse los XSD y resoluciones vigentes antes
  de implementar; el índice Anexosyestructuras.pdf devolvió 404 en esta revisión.
- GTI: https://www.facturaelectronica.cr/NuestroServicio
  Funciones públicas del servicio. No acredita API habilitada en la cuenta.
- GTI: https://pruebas.gticr.com/AplicacionFEPruebas/WSCargaFactura/Pruebas/GTICargaFactura.asmx?op=PagarFactura
  Servicio de pruebas indexado. No usar documentación antigua como contrato
  técnico vigente: obtener especificación actual y sandbox de GTI.

## Antes de integrar

1. Confirmar acceso API GTI, costo, límites, sandbox, modelo multiemisor y condiciones.
2. Comparar ese costo con operar un motor propio y mantener cambios normativos.
3. Validar con el contador casos de IVA, exoneraciones, actividades, CAByS y moneda.
4. Probar emisión, rechazo, consulta posterior a timeout, reenvío sin duplicados,
   notas de crédito/débito y aislamiento de documentos entre profesionales.
5. Guardar secretos cifrados del lado servidor; nunca en navegador ni repositorio.

Recomendación: interfaz común de proveedores y piloto de un emisor en sandbox.
No se ha implementado ni certificado facturación fiscal. No se afirma cumplimiento
legal completo. El prototipo actual descarga cotizaciones, claramente no fiscales.
