# Directorio multivertical — reclamo y verificación de lugares (F3) — LOCAL

Estado (2026-11-16): SQL, esquemas y adaptador listos y verificados en PGlite (memoria). **Sin aplicar** a la base local
compartida, **sin rutas** y **sin envíos reales** (solo emisor simulado). El cableado y el plan de `pro_entitled` están en
`dir-wiring-F3F5.md` (scratchpad de la sesión). Plan general: `docs/pro/directory-plan-local.md`; núcleo: `directory-core-local.md`.

## Archivos

| Archivo | Qué es |
|---|---|
| `docs/pro/sql/directory-claims-local.sql` (hoy en staging) | Reclamos, responsables, eventos, estado de reclamo del lugar y RPC. Depende del núcleo F1. |
| `docs/pro/sql/pro-entitled-draft.sql` (hoy en staging) | Borrador **no conectado**: `pro_entitled`, `pro_entitled_require`, `pro_membership_grant_launch_free`. |
| `src/lib/directory/claim-schemas.ts` | zod de cada entrada (abrir, código, verificar, retirar, revisar, agregar negocio, responsables). |
| `src/lib/directory/claim-otp.ts` | Generación (6 dígitos sin sesgo), HMAC-SHA256 con «pepper» del servidor, interfaz `ClaimCodeSender` y `MockClaimCodeSender`. Solo Web Crypto. |
| `scripts/pro/verify-directory-claims-db.mjs` | Prueba PGlite (`DIR_SQL_DIR`, por defecto `docs/pro/sql`). |

## Modelo

- **`dir_places.claim_status`**: `unclaimed → claim_pending → claimed`; vuelve a `unclaimed` si el reclamo se rechaza,
  vence o se retira. Un lugar reclamado pasa a `disputed` mientras hay una disputa abierta y vuelve a `claimed` con el
  dueño nuevo (aprobada) o el anterior (rechazada). Cada cambio queda en `dir_place_history` (acción `verify`, con `claimStatus`).
- **`dir_place_claims`**: un reclamo abierto por lugar (índice único parcial sobre `open`/`code_sent`). Estados
  `open`, `code_sent`, `approved`, `rejected`, `expired`, `withdrawn`; los cerrados son definitivos (disparador).
- **`dir_place_managers`**: un `owner` activo por lugar + responsables `manager` (máx. 10 activos). Solo pasan de activo a revocado.
- **`dir_place_claim_events`**: bitácora inmutable de transiciones. Recibos idempotentes en `dir_place_actions` (núcleo).

## Reclamo por correo (decisión del dueño, 2026-11-17)

Se reclama como en Yelp pero con **correo** en lugar de SMS (sin costo por mensaje). Orden en la ficha:

1. `email_listed` — código de 6 dígitos al correo **ya registrado** en la ficha (`dir_places.email`, importado de OSM `email`/`contact:email`, puesto por el equipo o por un dueño ya verificado). Cualquier dominio (Gmail incluido): quien reclama no lo elige, no lo escribe y solo lo ve enmascarado (`so***@gmail.com`). No es elegible si el correo fue agregado o cambiado en los últimos 30 días por alguien que no es del equipo ni dueño verificado, ni si la edición en OSM (fecha `observed_at`) tiene menos de 30 días (`dir_listed_email_eligible`, a partir de `dir_field_provenance`). Se revisa otra vez en cada envío. Nivel `claimed`.
2. `email_domain` — correo del dominio del sitio web; correos gratuitos rechazados (sin cambios).
3. `hacienda_juridica` / `document_review` — revisión del equipo (sin cambios).

`phone_listed` (SMS) sigue en el código pero **apagado**: la ficha no lo ofrece salvo `DIR_CLAIM_SMS_ENABLED=true` en el servidor **y** `dir_claim_settings.sms_enabled=true` en la base; si no, la ruta y el SQL responden `claim_sms_disabled`.

Envío: `EmailClaimCodeSender` (`src/lib/directory/claim-otp.ts`). Por defecto, buzón simulado en memoria (ruta local `/api/reclamos/<id>/buzon-prueba`, solo en desarrollo y solo para quien reclama). `DIR_CLAIM_EMAIL_MODE=sandbox` usa la ruta de correo de la app (`sendBrevoEmail`) con `X-Sib-Sandbox: drop`: Brevo no entrega nada. Este build nunca envía el código de verdad. El correo nunca sale en `dir_place_public`; la ficha lo recibe enmascarado de `dir_claim_options`. Importación: `node scripts/directory/stage-osm-extras.mjs <dump> osm --only email --part-start 2 --out <dir>`.

## Métodos y nivel de verificación

| Método | Cómo se prueba | Aprueba | Nivel |
|---|---|---|---|
| `phone_listed` | Código al **teléfono ya publicado** en la ficha. La entrada no lleva teléfono; si el último origen del teléfono es `owner` (escrito por un responsable o en «agregar mi negocio») no se permite. | el código | `claimed` |
| `email_domain` | Código a un correo cuyo dominio = sitio web publicado (sin `www.`), sitio de origen independiente; sin correos gratuitos. | el código | `claimed` |
| `hacienda_juridica` | Cédula jurídica (3 + 9 dígitos) cotejada con la API pública de Hacienda por el servidor (`identity-verifier.ts`, puntaje ≥ 0,6). No prueba representación: lo decide personal. | personal | `verified` |
| `document_review` | 1–5 documentos privados en `dir-claims/<claimId>/` (patente, personería, permiso sanitario, recibo, otro). | personal | `verified` |

El nivel nunca baja (un `license_verified` sobrevive a un reclamo) y un reclamo nunca otorga `license_verified`
(farmacias: lo da el personal con `dir_place_mutate verify`).

**Códigos**: el servidor genera el código y envía solo `HMAC(pepper, claimId:código)`; la base guarda el hash, vence a
los 10 min, máx. 3 envíos por reclamo con 60 s entre envíos y 5 intentos por reclamo (al quinto fallo: `rejected`,
motivo `attempts_exhausted`). Un intento fallido se guarda (no se revierte). El código vencido no consume intento.
**Vencimiento** del reclamo: 7 días (código) / 30 días (personal); perezoso al tocarlo y barrido `dir_claim_expire_due`.
**Topes**: 5 reclamos por persona al día, 3 por persona y lugar en 30 días, 3 «agregar mi negocio» al día (54000 → 429).

## Reglas de seguridad

- **Sin autoaprobación**: `dir_claim_review` rechaza al reclamante (42501 `dir_claim_self_review`) y a cualquier
  responsable activo del lugar (`dir_claim_conflict`); además la tabla exige `reviewed_by` distinto del reclamante y,
  para métodos de personal, revisor presente al aprobar. Los métodos por código no se aprueban a mano.
- **Lugar reclamado por otro**: sin `dispute:true` → 23505 `dir_place_already_claimed`; la disputa solo admite
  `document_review` o `hacienda_juridica`. Aprobada: se revocan todos los responsables (`dispute`) y entra el nuevo dueño.
- **«Agregar mi negocio»** (`dir_place_self_signup`): crea el lugar en **borrador** (origen `owner`) con `claim_pending`
  y un reclamo de personal; rechaza posibles duplicados (mismo nombre normalizado y vertical a < ~75 m o mismo cantón).
  Publicar sigue siendo decisión del personal.
- **Gratis y neutral**: ninguna columna, parámetro ni cuerpo de función de reclamos menciona pagos, planes ni membresías
  (la prueba lo comprueba); ningún RPC de reclamo lee `pro_*`.
- RLS en todo, solo `service_role`, sin DELETE, TRUNCATE bloqueado, funciones `security invoker` con `search_path` fijo.

## `pro_entitled` (borrador, no conectado)

Una sola regla SQL equivalente a `hasProAccess` + baneo. La prueba la compara con `hasProAccess` en 72 combinaciones.
`pro_membership_grant_launch_free` concede Pro gratis de lanzamiento solo si no hay fila previa, con auditoría. El plan
para sustituir las seis copias de la regla y para llamar la concesión está en `dir-wiring-F3F5.md` §6–7.

## Verificación

```
DIR_SQL_DIR=<staging> node scripts/pro/verify-directory-claims-db.mjs
```

## Pendiente / abogado

- Disputas: plazo de respuesta del dueño actual y aviso previo antes de revocarlo (hoy decide el personal sin aviso automático).
- Documentos privados: plazo de conservación y borrado (Ley 8968); quién puede verlos.
- Hacienda no prueba representación legal ni quién opera la cuenta: el texto público no debe prometerlo.
- Proveedor real de SMS/correo: adaptador con sandbox, consentimiento y costos antes de activarlo.
