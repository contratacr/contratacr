# Referencias de facturación para simplificar Pro — Costa Rica

Investigación pública del 31 de octubre de 2026. Solo checkout Pro y rama `local/pro-suite-no-push`. Este documento es evidencia de producto y recomendaciones; no certifica cumplimiento tributario ni demuestra que las funciones anunciadas sean las más utilizadas. No se contrató ningún servicio, abrió cuenta, solicitó una demostración, emitió comprobante ni envió datos a proveedores. La implementación y su validación se registran por separado.

## Qué se pudo comprobar

| Referencia | Evidencia oficial observada | Patrón útil para ContrataCR | Límite de la comparación |
|---|---|---|---|
| HuliPractice para Costa Rica | Publicita una operación centrada en la consulta: agenda, paciente y facturación. Su página de facturación destaca proformas reutilizables, prellenado desde la cita, seguimiento de abonos y reportes. | Preparar el documento desde el trabajo con los datos ya elegidos, y conservar las tareas comerciales dentro del contexto del cliente. | Es un producto de salud. No corresponde trasladar expediente clínico, recetas o nomenclaturas médicas a todos los oficios. No se auditó una cuenta privada ni su implementación fiscal. |
| Alegra Facturación para Costa Rica | Ofrece Facturación para independientes como producto distinto de ERP y POS. La ayuda CR coloca Cotizaciones bajo Documentos y explica una conversión que reutiliza datos y deja vínculos en ambos documentos. | Un acceso común para cotizaciones y facturas, con búsqueda y acciones claras, conservando la diferencia entre presupuesto y documento fiscal. | Alegra es una plataforma regional con oferta para Costa Rica, no se presenta aquí como empresa de origen costarricense. Plan comercial y documentación no prueban frecuencia de uso. |
| Factura Profesional / Cyberfuel | Su sitio oficial indexado presenta emisión/recepción, proformas y funciones comerciales por nivel de plan, con inventario y centros de costos adicionales. Los términos identifican a Cyberfuel como una sociedad constituida en Costa Rica. | Mantener el flujo habitual corto y ofrecer inventario/configuración especializada según necesidad, sin obligar a recorrer todos los módulos al preparar un documento. | La extracción directa de inicio/planes devolvió timeout/502; se pudo consultar su contenido oficial indexado y términos. No se inspeccionó el menú de una sesión ni una demo. No se afirma que sea una réplica simplificada de GTI. |

HuliPractice es el paralelo local más cercano al objetivo de ContrataCR: organizar un servicio y aprovechar su información al facturar. Alegra es la referencia más explícita para separar una oferta de facturación de un ERP completo. Factura Profesional muestra que una misma solución puede ofrecer capacidades por niveles. Estas son inferencias de diseño, no estadísticas del mercado.

## Recomendaciones aplicables a Pro

1. Un solo acceso principal **Ventas y cobros**, con pestañas **Cotizaciones**, **Facturas** y **Pagos y saldos**. La tarea de cotizar debe seguir siendo reconocible y accesible; un presupuesto no se convierte en factura por renombrar el menú.
2. Tres acciones frecuentes según el contexto: preparar cotización, preparar borrador de factura y consultar/registrar pagos. Mientras no exista emisión validada, la interfaz debe identificar las facturas como borradores y conservar sus límites actuales.
3. Reutilizar cliente, catálogo, plantillas y origen del trabajo. Los vínculos entre documentos deben servir para volver al origen, además de copiar datos.
4. Mantener visibles los campos necesarios del caso habitual y plegar configuración o datos sectoriales. Si un documento ya contiene una exoneración o un impuesto especial, debe poder revisarse y sus errores deben llevar al campo correcto; simplificar no significa ocultar datos históricos ni retirar validaciones.
5. Conservar clientes, agenda, inventario y gastos como herramientas conectadas. No añadir un menú por cada tipo de impuesto o documento poco frecuente.
6. Comparar utilidad mediante recorridos medibles —datos que no se vuelven a escribir, claridad de saldos, número de decisiones y recuperación de errores— en lugar de contar funciones de GTI.

No hay evidencia pública suficiente en esta revisión para decir qué porcentaje de usuarios costarricenses usa cada función. El criterio de priorización combina el flujo de profesionales de servicios de ContrataCR con patrones publicados por estos proveedores. La investigación con usuarios reales sigue pendiente.

## Fuentes primarias

- [HuliPractice Costa Rica](https://www.hulipractice.com/cr): oferta por tipo de práctica y conexión de agenda/paciente/facturación. La URL raíz redirigió a México; se utilizó expresamente `/cr`.
- [Huli: facturación electrónica para la consulta](https://www.hulipractice.com/cr/productos/facturacion-electronica): proformas, datos prellenados, abonos y reportes.
- [Centro de ayuda: Factura PRO en Costa Rica](https://help.hulipractice.com/es/collections/6028022-factura-pro-en-costa-rica): documentación separada de proformas/facturas, pagos, productos, proveedores e inventarios; confirma que el producto también tiene capacidades avanzadas.
- [Alegra Costa Rica: oferta por producto y planes](https://www.alegra.com/costarica/precios/): distinción de Facturación, ERP y POS. No se copian precios, promociones ni promesas de certificación a Pro.
- [Alegra CR: crear y gestionar cotizaciones](https://ayuda.alegra.com/cri/cree-tus-cotizaciones-en-af): recorrido Documentos → Cotizaciones, reutilización al convertir y vínculos entre documentos.
- [Factura Profesional: sitio oficial](https://www.facturaprofesional.com/) y [planes](https://www.facturaprofesional.com/planes-tarifas): contenido oficial indexado; límites de acceso indicados arriba.
- [Factura Profesional: términos v1.7](https://www.facturaprofesional.com/terminos-condiciones-v1.7): identificación de Cyberfuel y del producto. La lectura no implica aceptación ni contratación.

No se investigaron ni recomendaron tarifas tributarias, elegibilidad de exoneraciones o transmisión fiscal a partir de estas páginas comerciales. Esas decisiones pertenecen a la validación fiscal específica y al entorno de pruebas del proveedor elegido.
