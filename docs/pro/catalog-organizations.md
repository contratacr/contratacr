# Organización privada del catálogo Pro

Este bloque añade grupos de clientes y categorías del catálogo privado. No administra categorías públicas ni servicios sugeridos. Su instalación es local; no envía mensajes ni documentos fiscales.

## Integración

Aplicar `docs/pro/sql/catalog-organizations-local.sql` después del almacenamiento normalizado de catálogos y de `pro_catalog_search`. La instalación es repetible. No requiere actualizar clientes, productos, snapshots originales ni JSON del workspace. El preparador central debe incluir este archivo; este bloque no modifica ese preparador.

El modal usa `organizar=client_group|product_category` en la URL y el historial compartido de Pro. Cerrar o volver con un nombre pendiente requiere confirmar el descarte; cancelar conserva el borrador. Durante el guardado bloquea la salida. `renderTrigger` permite añadir la acción al menú de sección sin otro botón.

Importar desde `src/components/pro/catalog-organizations.tsx`:

```tsx
<CatalogOrganizations kind="client_group" renderTrigger={() => null} />
// En el menú: pushProParams({organizar: "client_group"})
<OrganizationSelect kind="client_group" label="Grupo" value={draft.group ?? ''}
  onChange={group => setDraft({...draft, group})} />

<CatalogOrganizations kind="product_category" />
<OrganizationSelect kind="product_category" label="Categoría" value={draft.category ?? ''}
  onChange={category => setDraft({...draft, category})} />
```

`OrganizationSelect` conserva el texto recibido en un campo editable. Las opciones administradas actuales aparecen en un selector separado con búsqueda y paginación; elegir una sustituye explícitamente el texto del borrador. No convierte silenciosamente una asignación histórica al nombre actual. Las etiquetas no administradas y las archivadas siguen siendo texto válido de registros anteriores.

## Contrato de datos y concurrencia

- `pro_catalog_organizations`: identidad UUID, propietario, tipo, nombre actual, archivado y posición estable.
- `pro_catalog_organization_aliases`: cada nombre usado queda reservado a esa identidad dentro del mismo propietario/tipo. La comparación de identidad ignora mayúsculas y espacios exteriores, pero conserva diferencias de acentos. Buscar sí ignora acentos.
- `pro_catalog_organization_revisions`: CAS propio por propietario/tipo. Administrar etiquetas nunca modifica `pro_workspace_core.revision` ni crea un workspace.
- Renombrar reserva el nombre anterior; no reescribe `Client.group`, `Product.category`, cotizaciones, facturas ni snapshots. El contador de asignaciones reconoce nombres actuales e históricos de la misma identidad. Incluye registros archivados del catálogo, pues su referencia sigue existiendo.
- Archivar solo retira una opción de las listas activas. Restaurar reutiliza la identidad y todos sus alias. No existe eliminación ni reapropiación de nombres históricos.
- Todas las mutaciones toman el bloqueo asesor por propietario y comparan revisión antes de escribir. Fallos de validación, colisión o revisión revierten la transacción completa.
- Las tablas permiten lectura únicamente al propietario mediante RLS. Escrituras directas y RPC están restringidos a `service_role`, tras `proApiAccess` en el servidor.

## API

`GET /api/pro/catalog-organizations?kind=client_group|product_category&filter=active|archived&q=...&after=...`

Devuelve `{items,nextCursor,revision}`. Cada elemento administrado tiene `{id,name,archived,recordCount,aliasCount}`. Las páginas tienen hasta 20 filas y cursor de posición estable. Los selectores se actualizan tras administrar etiquetas mediante un evento local acotado por tipo. La UI rechaza anexar páginas si cambió la revisión propia de organización.

`source=existing` devuelve nombres agregados del catálogo normalizado que todavía no pertenecen a ninguna identidad administrada: `{name,recordCount}`. Esta lista también pagina de 20 en 20, por clave textual con orden explícito `C`; no copia listas al workspace. La búsqueda se compara literalmente, sin interpolar comodines SQL. Mostrar nombres anteriores no los adopta: el botón «Administrar este nombre» ejecuta una creación explícita. Los contadores reflejan los registros disponibles al consultar y pueden variar independientemente de la revisión de etiquetas.

`POST` acepta `{kind,action,id,name?,revision}`. Acciones: `create`, `rename`, `archive`, `restore`; nombre obligatorio para crear/renombrar, máximo 80 caracteres. Devuelve `{revision}`. Revisión antigua: HTTP 409; nombre reservado: HTTP 400. La UI conserva su entrada ante conflicto y exige recargar antes de otra mutación.

## Validación aislada

```sh
PRO_PGLITE_MODULE=file:///tmp/contratacr-pro-db-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/pro/verify-catalog-organizations-db.mjs
```

El verificador crea una base efímera, prueba contratos de dominio, UTF8 y búsqueda literal, tres páginas de nombres existentes y administrados, CAS, reserva de alias, adopción, archivo/restauración, independencia entre propietarios/tipos, RLS y permisos de RPC. Compara core y todos los registros originales exactamente antes/después de instalar, mutar y reinstalar. También verifica que un propietario sin workspace puede administrar etiquetas sin crearlo.

La validación E2E y visual se realiza después de integrar estos componentes en los formularios y aplicar el SQL mediante el preparador local autorizado. No hay prueba visual implícita en la comprobación aislada.

Validación central posterior y límites actualizados: [aplicación de recomendaciones](gti-recommendations-execution-local.md). La evidencia final de ese registro sustituye las notas iniciales de pruebas pendientes de este documento.
