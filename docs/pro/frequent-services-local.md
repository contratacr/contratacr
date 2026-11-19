# Servicios frecuentes: simplificación local

Alcance: solo `local/pro-suite-no-push`, sin despliegue ni emisión de documentos.

- Plantillas y paquetes pasa a llamarse Servicios frecuentes, accesible desde Cotizaciones y su selector de líneas.
- Lista con Nuevo servicio frecuente, Activos/Archivados y búsqueda debajo.
- Se reutilizan los mismos registros, identificadores, revisiones y API; no hay migración ni eliminación de datos.
- El formulario mantiene descripción, cantidad y precio como campos principales. Tipo, unidad y código quedan como detalles opcionales. CABYS se conserva en los registros y al copiar desde catálogo, pero no se presenta como campo de este formulario.
- Guardar y Cancelar usan textos cortos para evitar recortes en móvil.
- Facturación sigue siendo una herramienta separada de borradores; no se añade emisión electrónica ni se elimina su información previa.

Validación visual: Safari en iPhone 17 Pro Simulator. Lista y formulario revisados; corregido recorte de los botones del pie. La entrada remota no introdujo texto y se canceló sin guardar. El guardado y la reutilización requieren la evidencia automatizada correspondiente.

Comprobaciones estáticas: ESLint de los tres componentes modificados, TypeScript y `git diff --check` sin errores.

Resultado final: las dos pruebas funcionales ES/EN pasan en WebKit móvil (`/tmp/pro-frequent-services-complete.log`, 2/2, 1.3 min). Cubren paginación privada, cantidades/precios, copias independientes en cotización/borrador, edición, archivo/restauración y reintento sin duplicados. El acceso de administración deja de duplicarse en el menú de Facturación; se conserva su ruta anterior y la reutilización de líneas.

Pendiente fuera de esta tanda: auditoría completa de las demás acciones y formularios de Herramientas. Esta evidencia no declara toda la versión Pro terminada.
