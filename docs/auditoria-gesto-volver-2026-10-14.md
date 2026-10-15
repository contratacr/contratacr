# Auditoría del gesto de volver en teléfono

Inventario de las **70 rutas** de la app (cada una también puede tener el prefijo `/en`). Una pantalla raíz sin flecha propia conserva la navegación del navegador o de la barra de la app. Las vistas internas y los selectores con flecha deben aceptar un deslizamiento horizontal que empiece en el borde izquierdo, sin enviar formularios ni activar filas.

| Familia | Rutas incluidas | Vuelta dentro de la app |
| --- | --- | --- |
| Búsqueda y catálogo | `/`, `/buscar`, `/categorias`, `/servicios`, `/profesionales`, `/profesionales/[slug]` | El catálogo vuelve de un grupo al índice; la ficha vuelve al origen. Las pantallas raíz no inventan un destino. |
| Proyectos | `/proyectos`, `/proyectos/[id]`, `/publicar-proyecto` | La ficha vuelve al tablero/origen; el formulario y su selector de servicio retroceden un paso por gesto. |
| Promociones | `/promociones`, `/promociones/[id]`, `/promociones/[id]/editar`, `/promociones/mis-promociones`, `/promociones/publicar` | Ficha, edición y publicación reutilizan su flecha visible; los diálogos se cierran sin publicar. |
| Empleos | `/empleos`, `/empleos/[id]`, `/empleos/[id]/editar`, `/empleos/mis-empleos`, `/empleos/publicar` | Igual que promociones; incluye la ficha de una vacante cerrada. |
| Cotizaciones | `/cotizar`, `/cotizacion/[code]` | Formularios y pasos conservan el botón visible y las protecciones por cambios sin guardar. |
| Cuenta e ingreso | `/login`, `/registro`, `/registro/cliente`, `/registro/profesional`, `/onboarding`, `/completar-perfil`, `/continuar-perfil`, `/olvide-contrasena`, `/reset-password`, `/eliminar-cuenta` | El gesto usa la flecha del paso o diálogo; no salta validaciones ni sale de la app desde una raíz. |
| Panel personal | `/dashboard/cliente`, `/dashboard/profesional`, `/mensajes`, `/notificaciones`, `/resena-google` | Subsecciones, privacidad, seguridad y conversaciones vuelven a su lista o panel. |
| Ayuda y soporte | `/ayuda`, `/soporte`, `/soporte/caso/[id]`, `/contacto`, `/como-funciona`, `/mejorar-mi-perfil`, `/verificacion-de-identidad` | Las vistas internas usan su flecha. Los índices siguen siendo destinos raíz. |
| Información y estados | `/privacidad`, `/terminos`, `/baja-correos`, `/mantenimiento`, `/servicio-no-disponible` | El historial pertenece al navegador; no se agrega una flecha ficticia en páginas raíz. |
| Administración | `/admin`, `/admin/actividad`, `/admin/analitica`, `/admin/aseguradoras`, `/admin/campanas`, `/admin/categorias`, `/admin/cobertura`, `/admin/contactos`, `/admin/costos`, `/admin/cuentas`, `/admin/empleos`, `/admin/login`, `/admin/promociones`, `/admin/proveedores/[id]`, `/admin/publicaciones`, `/admin/reportes`, `/admin/resenas`, `/admin/servicios`, `/admin/soporte`, `/admin/usuarios`, `/admin/usuarios/[id]`, `/admin/verificacion` | El panel admin usa su navegación propia; los detalles conservan «Volver». |

La corrección se concentra en el detector común del gesto y en las flechas de selectores, diálogos, fichas y formularios. Las pruebas automáticas ejercitan el selector de servicio, su subcategoría, el catálogo, los controles dentro de filas, la prioridad de capas, la dirección del gesto, la raíz y las subsecciones de cuenta en Chrome móvil y WebKit móvil. Las rutas públicas se revisan también con el smoke de ambos motores; la búsqueda de las cuatro áreas del mercado tiene pruebas de foco separadas. El simulador de WebView comprueba el comportamiento de la app, pero la sensación del gesto en iOS y Android físicos requiere una prueba manual de la siguiente versión de tienda.
