# Manifiesto SQL de Pro local

El preparador `scripts/pro/prepare-supabase-local.mjs` usa una sola lista ordenada:
`scripts/pro/local-sql-manifest.mjs`. La lista incluye cada archivo de
`docs/pro/sql/`, incluidos tareas, centro de tareas, seguimientos, avances,
archivos privados, Equipo, asignaciones, conversaciones, menciones y cronograma.
No es una migración ni una instrucción para producción.

El preparador conserva sus controles de loopback y sus fixtures fundacionales
sólo para Auth vacío. No resetea la instancia. Los tres módulos de instalación
inicial conservan guardias por tabla: membresías, almacenamiento normalizado de
catálogo y almacenamiento del panel. Los demás módulos se aplican en orden.
`catalog-item-types-local.sql` se ejecuta dos veces deliberadamente: después de
crear catálogo y después de crear facturación, para incorporar su protección de
referencias de inventario. `.env.test` se escribe después de instalar la lista
completa; sus claves no se imprimen.

`promotion-records-draft.sql` está incluido como protección de auditoría: crea
un índice único sobre `requestId` de publicaciones de promoción. No crea ni envía
promociones. Su dependencia es `memberships-draft.sql`, que define `pro_audit`.
No se omite como si fuera un módulo de campañas ni se activa una campaña.

## Verificaciones sin tocar la instancia compartida

```sh
node scripts/pro/verify-local-preparation-manifest.mjs
node scripts/pro/verify-local-preparation-db.mjs
```

La primera es completamente estática. Comprueba cobertura exhaustiva del
directorio SQL, dependencias, ausencia de duplicados accidentales, las tres
guardias y la repetición de inventario. Sus casos negativos demuestran que
omitir, duplicar, desordenar módulos o cambiar una guardia produce un fallo.

La segunda crea PostgreSQL PGlite **sólo en memoria** y lo destruye al finalizar.
No lee `.env.test`, no acepta una URL de base de datos, no usa Supabase ni abre
conexiones a la instancia local o a producción. Usa tablas fundacionales de
prueba para perfiles, profesionales, cotizaciones, proyectos y Storage; instala
el DDL real de notificaciones y todos los módulos del manifiesto, y vuelve a
aplicarlos con las mismas guardias. Comprueba conservación de filas, definiciones
de funciones, restricciones y políticas, un cliente legado normalizado,
denegación de lectura directa a roles de cliente y buckets privados.

PGlite no dispone de `pg_cron`: esta prueba omite únicamente la sentencia
`create extension if not exists pg_cron;` del módulo de mantenimiento e instala
un sustituto de `cron.schedule` que registra el nombre, expresión y SQL del
trabajo **sin ejecutarlo**. Comprueba que ese registro sea exacto y estable.
El preparador real conserva la instalación original de la extensión; no se
modifica ningún SQL de producto para acomodar la prueba.

Esta evidencia valida orden, compatibilidad SQL e idempotencia de la instalación
sobre una base de prueba. **No acredita** reconstrucción real de Supabase,
servicios Auth/Storage, concurrencia entre conexiones, programación real de cron
ni permisos de una instancia hospedada. Tampoco justifica reinstalar o resetear
la base compartida para probar el manifiesto.

## Agregar un módulo

Añadir el archivo al manifiesto después de sus dependencias, registrar las
relaciones en `localSqlDependencies` y ejecutar ambas verificaciones. No añadir
una llamada SQL suelta al preparador. Un módulo nuevo sin entrada explícita hace
fallar la verificación estática. Una instalación inicial no idempotente necesita
una guardia revisada; no agregar una para ocultar un fallo de reinstalación.
