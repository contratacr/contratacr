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
