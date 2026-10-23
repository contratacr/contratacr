# Preparación local de ContrataCR Pro — 23 de octubre de 2026

Autorizado por Isaac: crear local/pro-suite-no-push y contratacr-pro. No publicar.
Ruta de desarrollo: /es/pro-preview; responde 404 fuera de development.

## Implementado en esta primera iteración

Prototipo de trabajos/citas en memoria, estados, detección de solapamientos y
exportación CSV compatible con Excel con protección frente a fórmulas.
Sin datos reales, persistencia, cobros ni cambios de ranking. Chat, llamadas,
WhatsApp y verificación no pasan a pago. El prototipo está en español.

## Falta antes de habilitarlo

- Persistencia autenticada por profesional, RLS y aislamiento entre cuentas.
- Edición/cancelación, zona horaria Costa Rica explícita y agenda visual.
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
