# Directorio multivertical — reseñas de lugares (F5) — LOCAL

Estado (2026-11-16): SQL y esquemas listos y verificados en PGlite (memoria). **Sin aplicar** y **sin rutas**; cableado y
borrador de `admin_reviews_unified` en `dir-wiring-F3F5.md` (scratchpad de la sesión). Depende del núcleo F1 y de F3
(`dir_place_managers`).

## Archivos

| Archivo | Qué es |
|---|---|
| `docs/pro/sql/directory-reviews-local.sql` (hoy en staging) | `dir_reviews`, `dir_place_contacts`, disparadores y RPC. |
| `src/lib/directory/review-schemas.ts` | zod (envío con `validateReviewText` ES/EN, invitado, contacto, respuesta, moderación, cursor). |
| `scripts/pro/verify-directory-reviews-db.mjs` | Prueba PGlite (`DIR_SQL_DIR`). |

## Reglas (las mismas que las reseñas de profesionales)

| Regla profesional (origen) | En lugares |
|---|---|
| Medias estrellas 0,5–5 (migración 063) | `rating numeric(2,1)` con la misma restricción. |
| Moderación reversible publicada/oculta con motivo, quién y cuándo; disparador protector (170) | Igual. Solo `dir_review_moderate` puede cambiar esos campos (bandera de transacción); el disparador bloquea cualquier otro UPDATE o un INSERT ya oculto (42501 `dir_review_moderation_only`). Ocultar exige motivo; nadie modera su propio texto. |
| Agregado solo con publicadas (170) | Disparador recalcula `dir_places.rating_avg` (2 decimales, nulo si 0) y `rating_count`. No sube `revision` del lugar para no causar 40001 a quien edita la ficha. |
| Reseña sin cuenta amarrada a un contacto, nombre en instantánea (208) | `dir_place_contacts`: se registra al tocar WhatsApp/llamar en la ficha (huella HMAC del dispositivo). Reseña de invitado solo con un contacto de ESE lugar y ESE dispositivo, de hasta 90 días; una por contacto y una por dispositivo y lugar. |
| Una por persona y profesional; editar actualiza (217) | Una por persona y lugar; un segundo envío debe editar la existente con `revision` (CAS → 40001). Editar no republica una reseña oculta. |
| `validateReviewText` (300 caracteres, insultos, amenazas, enlaces, @) | La ruta usa la función compartida; la base vuelve a exigir 1–300 caracteres sin enlaces ni @. |

Además: el nombre es una instantánea (`author_name_snapshot`; con cuenta, el nombre del perfil); los responsables del lugar
no pueden reseñarlo; solo se reseñan lugares visibles en la ficha pública (farmacias con `license_verified`); tope de 10
reseñas nuevas por persona al día.

**Respuesta del dueño**: un responsable activo responde **una vez** (sin enlaces, ≤ 1000); queda final (el disparador
impide editarla) y el personal puede ocultarla o publicarla aparte (`owner_reply_status`) sin afectar la reseña.

**Lectura pública** `dir_place_reviews_public(slug, cursor)`: solo publicadas, 20 por página, más recientes primero; sin
ids de autores, contactos ni moderadores; la respuesta solo si está publicada. `dir_review_mine` muestra al autor su
reseña aunque esté oculta, con el motivo. `dir_review_admin_list` alimenta la vista unificada de /admin.

Seguridad: RLS, solo `service_role`, sin DELETE (las reseñas se ocultan), TRUNCATE bloqueado, contactos inmutables,
funciones `security invoker` con `search_path` fijo.

## Verificación

```
DIR_SQL_DIR=<staging> node scripts/pro/verify-directory-reviews-db.mjs
```

## Pendiente / abogado

- Retiro de la propia reseña por el autor (derecho de supresión, Ley 8968): hoy solo el personal la oculta.
- Reportar una reseña desde la ficha pública (se puede reutilizar `dir_reports` con un tipo nuevo).
- Reseñas en lugares de salud (farmacias): revisar con abogado si conviene limitarlas a servicio/atención.
