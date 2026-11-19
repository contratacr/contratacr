# Calentamiento de la vista local

`node scripts/pro/warm-local-preview.mjs` prepara las rutas públicas `/`,
`/registro`, `/login`, `/proyectos`, `/promociones` y `/empleos`, y descarga por
completo sus scripts únicos de Next. El destino está fijado a
`http://127.0.0.1:3185`; el servidor debe estar iniciado previamente.

Las peticiones GET son secuenciales, sin sesión ni credenciales. No abre un
navegador, no llena su caché, no modifica fixtures ni datos y no configura
servidores. Solo admite redirecciones locales a las rutas expresamente permitidas o a scripts
estáticos de Next, hasta tres saltos. Falla ante destinos externos, errores HTTP,
tipos inesperados, respuestas vacías o excesivas y tiempos agotados. Imprime
rutas, bytes y duración; no imprime HTML ni contenido de scripts.

Úselo antes de una comprobación que requiera recursos ya compilados, cuando no
haya pruebas ni revisión visual en curso. Un resultado correcto **no certifica
el arranque frío**, el rendimiento de la primera visita, la navegación ni la
funcionalidad de la aplicación. Esas comprobaciones requieren evidencia propia.

`node scripts/pro/warm-local-preview.mjs --verify` ejecuta únicamente pruebas
puras de validación de URLs y extracción de scripts; no hace peticiones.

`node scripts/pro/warm-local-preview.mjs --pro` añade el HTML de entrada de
Notificaciones, en español e inglés, y sus scripts referenciados. Sigue
sin iniciar sesión ni enviar cookies: prepara los módulos de esas páginas,
no accede al expediente de ninguna cuenta ni acredita autenticación. No acepta
rutas arbitrarias ni parámetros de consulta. El modo predeterminado conserva
las seis rutas públicas originales.

Motivo del modo Pro: preparar solo páginas públicas no compila el centro de
notificaciones. Se observaron un fallo del proxy local y una
verificación de sesión que agotó sus 8 segundos durante esas navegaciones;
no se aumentó el límite ni se cambió la protección de sesión. El servidor
respondía de nuevo en unos 45 ms estando quieto, por lo que no se reinició en esa comprobación inicial.
La repetición con módulos preparados aporta evidencia del recorrido, no prueba
que la causa de todos los fallos fuese compilación ni certifica carga fría.

El panel exige iniciar sesión antes de servir su HTML. El primer intento del
modo ampliado se detuvo ante esa redirección protegida; no se siguieron sus
parámetros ni se eludió el control de acceso. El modo final prepara ocho rutas:
las seis públicas y Notificaciones ES/EN. El panel se verifica con las cuentas
ficticias de las propias pruebas, sin credenciales en este script.

Retención de módulos para el entorno local: `next.config.ts` configura
`onDemandEntries` con 15 minutos y 20 páginas únicamente cuando NODE_ENV es
development y Supabase es exactamente `http://127.0.0.1:54321`. La documentación
y el código de Next 16.4.2 instalados describen la eliminación de entradas de
desarrollo; sus valores predeterminados eran 60 segundos y cinco páginas.
La evaluación del config compilado verificó la opción local y su ausencia tanto
en producción como en desarrollo con un destino remoto. Esto conserva módulos
compilados; no cambia datos, autenticación, tiempos de verificación ni cachés de
producción. El cambio produjo el reinicio automático normal de Next (PID 60486),
sin reiniciar Supabase ni el gateway LAN. La repetición de regresiones queda
registrada por separado; no se atribuye causalidad exclusiva sin evidencia.
