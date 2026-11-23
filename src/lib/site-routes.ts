// Todo lo que NO es el enlace corto de un profesional.
//
// El enlace público de un perfil es contratacr.com/nombre-apellido, así que el
// middleware tiene que saber qué primeros segmentos son secciones del sitio y
// no nombres. `scripts/ci/verify-app-surface-ownership.mjs` falla si se agrega
// una carpeta en src/app o src/app/[locale] que no esté aquí, para que una
// sección nueva nunca termine cayendo en «perfil no encontrado».
export const RUTAS_DEL_SITIO = new Set([
  // idiomas y carpetas de src/app
  "es", "en", "api", "auth", "descargar", "abrir-app",
  // secciones de src/app/[locale]
  "admin", "atraer-clientes", "ayuda", "buscar", "categorias", "como-funciona",
  "completar-perfil", "continuar-perfil", "contacto", "cotizacion", "dashboard", "eliminar-cuenta", "empleos",
  "login", "mantenimiento", "mejorar-mi-perfil", "mensajes", "notificaciones", "ofertas", "promociones", "proyectos", "solicitudes",
  "olvide-contrasena", "onboarding", "privacidad", "profesionales",
  "proveedores-autorizados", "publicar-solicitud", "publicar-proyecto", "cotizar", "registro",
  // La invitación a reseñar en Google, a la que lleva el aviso de la campanita.
  "resena-google", "reset-password", "verificacion-de-identidad", "baja-correos",
  "servicio-no-disponible", "servicios", "soporte", "terminos",
  // Pro local: página pública del proveedor invitado a una licitación (solo desarrollo).
  "licitacion-proveedor",
  // Pro local (Ronda 6A): página pública de un enlace de pago (solo desarrollo).
  "pagar",
  // Pro local (Ronda 6D): sitio web del profesional (/sitio/<slug>) y baja de sus campañas de correo (solo desarrollo).
  "sitio", "baja-pro",
  // Pro local (correcciones post-seguridad): confirmación de la suscripción del formulario del sitio (doble confirmación, solo desarrollo).
  "confirmar-pro",
  // Pro local: vista previa del espacio Pro (solo desarrollo; el middleware ya la reescribe a /es/pro-preview).
  "pro-preview", "contratacr-pro",
  // Pro local (directorio multivertical, solo desarrollo): ficha de un lugar (/lugar/<slug>), secciones con búsqueda,
  // anuncios de vehículos e inmuebles. «Cómo ordenamos» (F0) explica la neutralidad del orden.
  "lugar", "restaurantes", "farmacias", "supermercados", "gasolineras", "vehiculos", "inmuebles", "como-ordenamos",
  // Secciones nuevas del directorio (aprobadas el 2026-11-17, solo desarrollo).
  "cafes", "pulperias", "ferreterias", "hospedaje", "salud", "veterinarias", "talleres", "belleza", "gimnasios", "tours", "bancos",
  // P3 (solo desarrollo): comparador de precios de supermercados y farmacias (solo venta libre).
  "precios",
  // IA 2026-11-21: hub "Lugares" y página "Para negocios y profesionales" (solo con el directorio encendido).
  "lugares", "negocios-y-profesionales",
  // Ronda de funciones del directorio (2026-11-17, solo desarrollo): agenda de eventos, páginas de marca, mis listas y
  // listas compartidas (/lista/<token>).
  "eventos", "marca", "listas", "lista",
  // Arreglos pendientes (2026-11-17, solo desarrollo): enlace privado de una reserva (/reserva/<token>) y «Mis reservas».
  "reserva", "mis-reservas",
  // enlaces cortos de campañas y archivos servidos desde la raíz
  "ig", "tt", "fb", "wa", "pro",
  // enlaces cortos de ficha: /o/<oferta>, /e/<empleo>, /c/<cotización>
  "o", "e", "c", "p",
  "sitemap.xml", "robots.txt", "favicon.ico", "manifest.json",
  // Sitemap del directorio (/sitemap-directorio/sitemap/<n>.xml).
  "sitemap-directorio",
]);
