# Consentimiento de estadísticas y publicidad — 29 de octubre de 2026

> **Actualización 26-nov-2026 (decisión de Isaac):** en la web el aviso pasó a un
> solo botón «Continuar» y una X, sin botón de rechazo, como el de Gymshark. Pulsar
> «Continuar», cerrar con la X o pasar a OTRA página de la app (navegación del
> cliente; una recarga o la primera vista no cuentan) equivale a aceptar estadísticas
> y medición publicitaria. Nunca se cambia una negativa guardada antes (aunque haya
> vencido). En la app nativa solo «Continuar» acepta. La elección guarda
> `source` (`click`, `close` o `implicit`) en el navegador; solo `click` se refleja
> en el libro de consentimientos de la cuenta. Retirar o cambiar la elección:
> «Configurar cookies y privacidad» en el pie y en /privacidad. No hay confirmación
> legal de que el consentimiento implícito baste bajo la Ley 8968; es una decisión
> de riesgo asumida por Isaac. El texto de abajo describe el diseño anterior.

Decisión de producto: consentimiento previo por finalidad en web y apps. «Solo
necesarias» no se interpreta como permiso de analítica o Meta. Las operaciones
solicitadas, sesión, seguridad, idioma y preferencias siguen funcionando.
Estadísticas de uso y publicidad se eligen por separado; no se mezclan con los
 términos, correos promocionales, IA ni permisos del sistema operativo.

El aviso ofrece aceptar todas, solo necesarias y configurar, con las dos primeras
acciones de igual prominencia. La configuración se puede reabrir desde el footer
y la política de privacidad. Diseño ES/EN, área segura y desplazamiento en pantallas
pequeñas, foco y Escape en diálogo nativo. El login conserva enlaces informativos;
las cuentas nuevas, incluso OAuth, pasan por los formularios con casilla de términos.

La recogida se controla tanto en el cliente como en las APIs/escritores internos.
La configuración de publicidad nativa es independiente de estadísticas. No se
incorporan nuevos campos personales a Meta, Pixel, IDFA ni publicidad automática.
Las preferencias caducan a los 180 días sin renovar ese plazo en cada visita.
La retirada limpia atribución opcional y pide al servidor quitar el identificador
HttpOnly; espera la cancelación de anuncios pendientes antes de borrar dicho ID.
No se promete recuperar envíos en vuelo ni borrar datos ya recibidos por Meta.
Las colas con la versión anterior del contrato Meta dejan de ser entregables.

La migración 255 añade estadísticas al registro por cuenta y versiona las nuevas
elecciones de estadísticas/publicidad, manteniendo intacta la versión de términos
y de IA. No hay aceptación histórica inferida. Los visitantes guardan su elección
local con versión y fecha; las acciones explícitas de cuentas tienen recibo servidor.
Los contactos solicitados conservan su historial desde los registros operativos,
aunque no se guarden eventos opcionales de interacción.

## Validación y selección

Base main/test 1e16ffa2 (runtime certificado previamente 71627fd1); esta evidencia
previa no certifica el cambio de privacidad. Comportamientos afectados: arranque,
consentimiento, analítica, atribución, Meta, registro/login y recibos de privacidad.
Pruebas locales: 46 contratos/lógica runtime, 16 escenarios de UI real React/CSS
Chromium/WebKit (ES/EN, 320/390/768/1440), PGlite de recibos y permisos, 100 pruebas
del planificador; tipos, ESLint, codificación e inventario. Sin semillas productivas
ni envíos reales a Meta. No equivale a validación física ni exhaustiva remota.

Los recorridos generales de regresión usan una elección previa «solo necesarias».
Los casos de primer ingreso eliminan esa fixture y prueban el aviso real; los casos
de analítica optan explícitamente a estadísticas. Resetear autenticación conserva
la preferencia del dispositivo. Las nuevas huellas revisadas del runner solo agregan
esa fixture y la spec del aviso: no cambian resolución, hooks, motores ni imports
ocultos. Los cambios de configuración siguen seleccionando CI amplia.

Despliegue: aplicar la migración 255 mediante el workflow existente, revisar su plan
sin aplicar migraciones históricas inesperadas. Seguir las compuertas automáticas
web/móvil/seguridad/despliegue; no certificar sus resultados por estas pruebas locales.
El incidente físico de congelamiento previo permanece pendiente de validación con
el documento actualizado y login real; esta modificación no lo cierra.

## Referencias consultadas

- PRODHAB, consentimiento informado: https://www.prodhab.go.cr/preguntasfrecuentes.aspx
- ICO, cookies: https://ico.org.uk/for-the-public/online/Cookies/
- ICO, igual prominencia en opciones: https://ico.org.uk/media2/migrated/4027811/cookie-banner-concerns.pdf
- Apple, permisos de seguimiento: https://developer.apple.com/documentation/apptrackingtransparency
- Meta, controles revisables: https://about.fb.com/news/2021/09/updating-our-cookie-controls-in-europe/

Se adopta una política conservadora uniforme; las referencias europeas son guías
de diseño y no una afirmación de que toda norma europea aplique a todos los usuarios.
Las métricas de uso consentidas no deben presentarse como el total de visitantes;
los totales operativos (cuentas, proyectos, transacciones) deben distinguirse.
