# Preparación local de ContrataCR Pro — 23 de octubre de 2026

Autorizado por Isaac: crear local/pro-suite-no-push y contratacr-pro. No publicar.
Ruta de desarrollo: /es/pro-preview; responde 404 fuera de development.

## Implementado localmente

Agenda con citas vinculadas a clientes y cotizaciones aceptadas, edición,
cancelación, finalización y detección de solapamientos en horario de Costa Rica.
Clientes con edición y archivo; cotizaciones con múltiples líneas, IVA y total,
registro manual de aceptación/rechazo y descarga no fiscal. Inventario con SKU,
costo, precio, mínimos, entradas/salidas e historial; impide saldos negativos.
Persistencia localStorage validada y respaldo JSON; agenda CSV compatible con Excel.
Reutiliza Button y SectionHeadline del panel. Solo usar datos ficticios.
No hay conexión de estos registros con Supabase, GTI o Hacienda.

Validación: 18 ejecuciones aprobadas en Chromium escritorio/móvil y WebKit móvil;
TypeScript y ESLint aprobados. Se corrigieron la ruta local interceptada como perfil
y la importación de Node en instrumentación para permitir la vista de desarrollo.
Las pruebas de componentes no equivalen a la regresión completa del producto.

## Falta antes de habilitarlo

- Persistencia autenticada por profesional, RLS y aislamiento entre cuentas.
- Agenda visual de calendario, recurrencia y recordatorios.
- Reservas públicas opcionales, confirmación del profesional y recordatorios.
- Bandeja de seguimiento integrada con conversaciones y cotizaciones existentes.
- Exportación XLSX real y controles de permisos/datos incluidos.
- Rotación de posiciones patrocinadas relevantes por servicio y zona; nunca
  garantizar primer lugar a todos. Etiqueta Patrocinado independiente de verificado.
- Precio, facturación, pasarela, cancelación y pruebas de webhooks/idempotencia.
- Validar condiciones de fuentes nacionales, jurídicas y DIMEX antes de habilitar
  consultas. No reutilizar endpoints administrativos para ofrecer consultas públicas.
- Traducciones EN, accesibilidad, revisión visual y pruebas de recorrido con sesión.

El historial 5590123a^ contiene la agenda retirada y 8093c71a^ los pagos antiguos.
Reutilizar exige revisión: no restaurar todo el código borrado indiscriminadamente.
El bundle privado de Pro de Windows no se encontró en esta Mac.

## Difusión en redes (local)

«Destaca en nuestras redes» permite solicitar una difusión orgánica por mes
calendario de Costa Rica. Pendiente/aprobada/publicada reservan el cupo; rechazada
con motivo lo libera. No se acumula. La revisión está en /pro-preview/admin,
solo en development, y comparte el almacenamiento del navegador. Es una simulación
administrativa: aún no tiene autorización de roles, suscripciones ni cuotas de
servidor por cuenta. No habilitar para usuarios hasta integrar esas garantías.
Registrar como publicada exige aprobación previa y enlace HTTPS; no envía nada.
Antes de publicar faltan integración con panel admin autenticado, aislamiento,
auditoría de actor y límite transaccional en servidor. Pruebas: cuota, cambio de
mes CR, rechazo, transiciones, enlaces y recorrido solicitante/admin persistente.

## Acceso Pro e integración en panel — 23 de octubre

Entrada /admin/pro añadida al grupo Negocio de AdminShell, protegida con
requireAdmin y MFA existente; administradores conservan su rol y tienen acceso
Pro implícito. /dashboard/pro comprueba sesión, perfil activo y membresía de
servidor, sin confiar en metadatos editables. Ambas rutas siguen limitadas a
desarrollo. El almacenamiento de las herramientas continúa siendo la simulación
local compartida del navegador; usar únicamente datos ficticios. No es todavía
almacenamiento por usuario. El SQL docs/pro/sql/memberships-draft.sql es borrador,
no migración aplicada. Falta integrar persistencia por cuenta y permisos de las
operaciones, gestión/auditoría de membresías y la cola compartida de redes.

SG Solutions docs/tilopay.md describe checkout alojado de prueba y confirmación
servidor contra consult. Reutilizar arquitectura y pruebas, no sus credenciales.
ContrataCR debería tener integración/comercio identificable, retornos, secretos,
pedidos y conciliación separados. Una carpeta no separa cobros. Confirmar con
Tilopay si puede estar en el mismo acceso administrativo con otra integración o
si exige afiliación distinta, especialmente al cambiar titular a sociedad.
No se creó cuenta ni se conectó una cuenta existente.
GTI documenta integración y sandbox solicitado a soporte; eso no demuestra que
el plan actual permita API para Next.js ni múltiples emisores. Pedir contrato,
especificación vigente y sandbox antes de construir adaptador. Cobro de Pro
(ContrataCR emisor) y facturas de cada profesional son flujos independientes.

## Implementación de servidor preparada (actualiza los pendientes anteriores)

- /admin/pro usa AdminShell con gestión de membresías, herramientas personales
  del administrador y cola de difusión de todos los usuarios paginada de 20 en 20.
- /dashboard/pro usa acceso Pro comprobado en servidor. Administradores requieren
  MFA y reciben Pro sin cambiar su rol; cuentas deshabilitadas no tienen acceso.
- /api/pro/workspace lee/escribe solo el propietario de la sesión; usa revisión
  optimista y no acepta cambios de historial, duplicados ni stock incoherente.
- /api/pro/social comprueba membresía y solicita cuota mensual en SQL; las
  decisiones se realizan exclusivamente en /api/admin/pro con administrador/MFA.
- SQL incluye RLS por propietario, escrituras/RPC solo para service_role, índice
  de cuota mensual y auditoría de decisiones/membresías. No se aplicó remotamente.
- Interfaz de servidor no usa el localStorage de la vista demostrativa. Conflictos
  muestran error y conservan el formulario abierto. La demostración permanece
  en /pro-preview con datos ficticios propios del navegador.
- Contratos independientes de proveedor en src/lib/pro/billing/contracts.ts;
  ninguna implementación de pago o emisión está habilitada. La verificación
  compara pedido/importe/moneda/entorno; la activación real requiere confirmación
  directa del proveedor e idempotencia persistente aún por implementar.

Validación local SQL (PostgreSQL embebido PGlite, instalado fuera del repo):
`PRO_PGLITE_MODULE=file:///ruta/node_modules/@electric-sql/pglite/dist/index.js node scripts/pro/verify-local-db.mjs`.
Comprueba revisión, cuota mensual, transiciones, auditoría, aislamiento de lecturas
por RLS y denegación de RPC/escrituras directas por authenticated. No sustituye
prueba con Supabase Auth/PostgREST real ni prueba física de móviles.

Bloqueos externos para cierre: Docker/Supabase local no disponibles en esta Mac;
no se copiaron credenciales remotas ni se cambió configuración de producción.
Falta levantar esa infraestructura y aplicar SOLO allí el borrador, iniciar una
sesión admin con MFA y completar la prueba visual del AdminShell y los recorridos
contra Auth/PostgREST. Credenciales/contratos sandbox de Tilopay y GTI aún no
confirmados para ContrataCR. Tampoco hay precio/periodicidad de Pro definidos.
No crear cobros, emitir documentos ni habilitar suscripciones sin resolverlo.
Las recomendaciones de proyectos, ranking patrocinado, consultas de identidad,
recordatorios y reservas públicas siguen siendo trabajos separados no habilitados.
