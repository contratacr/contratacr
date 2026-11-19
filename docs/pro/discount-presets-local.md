# Descuentos comerciales guardados en Pro

Los descuentos guardados son preajustes comerciales reutilizables del descuento único que ya admite cada línea. No añaden códigos fiscales, acumulación de múltiples descuentos, impuestos ni versiones de factura. No habilitan emisión real.

Cada preajuste tiene nombre (1–80), motivo comercial (1–160), método `percent|amount` y valor decimal positivo de hasta cinco decimales. El porcentaje admite hasta 100; el monto por línea hasta 100000000 CRC. El valor se almacena como texto decimal, sin conversión a coma flotante. Los descuentos manuales de cero y los documentos existentes conservan su contrato anterior.

Aplicar copia solo `discountType`, `discount` y `discountReason` en la línea del borrador que está editando el usuario. No guarda automáticamente la factura ni enlaza documentos al catálogo. Un monto superior al importe bruto de esa línea se rechaza conservando sus campos anteriores. Las matemáticas fiscales y el redondeo existentes permanecen intactos. Modificar o archivar un preajuste no modifica ninguna factura, cotización ni JSON histórico.

## Almacenamiento y API

Aplicar `docs/pro/sql/discount-presets-local.sql` después de `pro_catalog_search`. Es una instalación repetible sin backfill. Crea `pro_discount_presets` y `pro_discount_preset_revisions`, con propietario, RLS, revisión propia y bloqueo asesor por propietario. No crea ni actualiza workspace/core. Solo el servidor autorizado con `proApiAccess` puede invocar las funciones de lectura/escritura. El cliente autenticado puede leer únicamente filas propias; no puede escribir directamente ni invocar RPC.

- GET `/api/pro/discount-presets?filter=active|archived&q=...&after=...`: `{items,nextCursor,revision}`, máximo 20 filas; búsqueda literal por nombre y motivo, insensible a acentos. Cursor por posición numérica estable. Cada fila tiene `{id,name,reason,method,value,archived}`.
- POST `{action:'save',id,revision,preset:{name,reason,method,value}}`: crea o edita el preajuste propio sin cambiar su estado archivado.
- POST `{action:'archive'|'restore',id,revision}`: cambia únicamente disponibilidad.
- Respuesta `{revision}`; CAS antiguo produce 409. Nombres duplicados por propietario, incluidos archivados, producen 400. La escritura completa revierte ante fallo. Cada propietario dispone de su espacio independiente de nombres.

## UI e historial

El editor de detalle mantiene sus campos manuales. El picker de preajustes está plegado en «Aplicar descuento guardado»; sus opciones se buscan y paginan. «Administrar descuentos» abre `descuentoCatalogo=1`, conservando la ruta exacta de la factura subyacente. Se monta un solo manager por editor.

El manager permite crear, editar, archivar/restaurar y buscar. Mantiene el borrador de edición al cambiar filtros y ante errores; anexar páginas con distinta revisión se rechaza. Otro guardado invalida las opciones visibles del picker mediante un evento local. El Back del modal superior no descarta la factura subyacente: el editor mantiene `beforeunload` y cede su guardia de traversal al manager mientras está abierto. Salir del manager con cambios exige confirmar; cancelar restaura la misma ruta e inputs. Durante el guardado se bloquea la salida.

## Prueba aislada

```sh
PRO_PGLITE_MODULE=file:///tmp/contratacr-pro-db-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/pro/verify-discount-presets-db.mjs
```

El verificador comprueba esquema y límites, copia exacta de cinco decimales, rechazo de monto excesivo, independencia de snapshots, CAS, archivo/restauración, nombres duplicados archivados, tres páginas completas, UTF8 y búsqueda literal, aislamiento de propietarios y RLS, reinstalación y preservación exacta de core/documentos existentes. La prueba E2E y revisión visual deben ejecutarse centralmente tras integrar el nuevo SQL en el preparador local.

Validación central posterior y límites actualizados: [aplicación de recomendaciones](gti-recommendations-execution-local.md). La evidencia final de ese registro sustituye las notas iniciales de pruebas pendientes de este documento.
