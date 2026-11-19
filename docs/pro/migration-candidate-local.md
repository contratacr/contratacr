# Primer candidato de migración: normalización

5 noviembre 2026. Pro local `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`.

## Alcance y ejecución segura

`migration-candidate-v1.json` fija orden y SHA-256 de los scripts existentes que pasan clientes, catálogo, movimientos, agenda, disponibilidad, cotizaciones históricas y enlaces del documento a sus tablas. La repetición final del parche de tipos es intencionada: funciona también después de crear consumidores.

No se añade todavía un número a `supabase/migrations`: la base y el alcance público deben decidirse antes de una integración. Este candidato requiere el esquema legado Pro y las tablas base de la aplicación; **no instala Pro sobre una base main sin Pro**. Membresías se usan solo para preparar el esquema ficticio del ensayo. Facturas, solicitudes, pagos y demás extensiones requieren fases adicionales; no se presentan como incluidas.

Ejecutar desde Pro:

```sh
node scripts/pro/rehearse-migration-candidate.mjs
```

Usa PGlite ya disponible, memoria únicamente. No acepta URL/credenciales ni usa Supabase, red, env de producción, fixtures existentes o procesos de emisión. Verifica las huellas antes de ejecutar el candidato. Un cambio en SQL exige revisar y versionar el manifiesto, no saltarse el control.

## Validación realizada

PASS: documentos de dos cuentas ficticias (una poblada y otra dispersa), revisiones y fechas idénticos antes/después; ambos respaldos íntegros; 42 trabajos y dos líneas de cotización preservados; datos normalizados fuera del JSON; reaplicación de la primera transformación rechazada sin daño; otra cuenta no puede leer contactos/trabajos ajenos ni respaldos privados, ni escribir directamente.

La primera ejecución del comprobador esperaba cero filas al consultar respaldos con rol autenticado; el esquema correctamente devuelve permiso denegado. Se corrigió la expectativa para exigir específicamente SQLSTATE 42501, conservando las comparaciones íntegras anteriores. No se cambiaron las políticas ni el SQL para obtener verde.

Selección: nuevo ensayo del manifiesto y lint del script/diff-check. Se reutilizan las regresiones funcionales y de compilación anteriores: no se modifica el producto, SQL existente, traducciones, sesión o permisos. La base Supabase del simulador no recibe escrituras. Evidencia en `research/2026-11-05/scope-and-migration/`.

## Lo que sigue antes de publicar

1. Delimitar integración del núcleo de servicios, según `service-marketplace-comparison-2026-11-05.md`; conservar módulos secundarios y sus datos.
2. Completar fases/prerrequisitos desde una copia aislada del esquema real elegido, incluyendo origen sin Pro y extensiones necesarias. Respaldo comprobado, ensayo de fallo/recuperación y contratos de acceso. No revertir destruyendo tablas ya usadas.
3. Revisar activación explícita para entornos aislados y validar compilación ejecutada con esa configuración. Las guardas de desarrollo actuales se conservan.
4. Solo tras autorización, integrar y verificar el entorno destino. Sin push ni producción en esta ronda.
