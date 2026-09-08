// Todo lo que NO es el enlace corto de un profesional.
//
// El enlace público de un perfil es contratacr.com/nombre-apellido, así que el
// middleware tiene que saber qué primeros segmentos son secciones del sitio y
// no nombres. `scripts/ci/verify-app-surface-ownership.mjs` falla si se agrega
// una carpeta en src/app o src/app/[locale] que no esté aquí, para que una
// sección nueva nunca termine cayendo en «perfil no encontrado».
export const RUTAS_DEL_SITIO = new Set([
  // idiomas y carpetas de src/app
  "es", "en", "api", "auth",
  // secciones de src/app/[locale]
  "admin", "atraer-clientes", "ayuda", "buscar", "categorias", "como-funciona",
  "completar-perfil", "contacto", "dashboard", "eliminar-cuenta", "empleos",
  "login", "mantenimiento", "mensajes", "notificaciones", "ofertas",
  "olvide-contrasena", "onboarding", "privacidad", "profesionales",
  "proveedores-autorizados", "publicar-proyecto", "registro", "reset-password",
  "servicio-no-disponible", "servicios", "soporte", "terminos",
  // enlaces cortos de campañas y archivos servidos desde la raíz
  "ig", "tt", "fb", "wa", "pro",
  "sitemap.xml", "robots.txt", "favicon.ico", "manifest.json",
]);
