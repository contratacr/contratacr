import { Suspense, type ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Inter } from "next/font/google";
import { NativeDebugLogger } from "@/components/mobile/native-debug-logger";
import { NATIVE_ONBOARDING_COMPLETED_KEY } from "@/lib/mobile-onboarding";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  // La app nativa se reconoce por su cookie ya EN EL SERVIDOR: las clases del
  // armazón viajan pintadas en el HTML y React las reconoce como suyas. Cuando
  // las sembraba un script antes del primer cuadro, la hidratación las borraba
  // y el acomodo nativo se caía y volvía — el salto del arranque (main 0→64).
  const esApp = (await cookies()).get("ccr_platform")?.value === "native";
  // El idioma lo pone el middleware en la petición (`x-ccr-locale`). Con la
  // cookie no bastaba: un buscador llega sin cookies y habría leído toda la
  // versión en inglés marcada como española.
  const idioma = (await headers()).get("x-ccr-locale") === "en" ? "en" : "es";
  const clasesNativas = esApp ? " ccr-native-app ccr-native-bottom-nav-visible" : "";
  return (
    <html
      lang={idioma}
      className={`${inter.variable} h-full antialiased${clasesNativas}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* PRIMERO el viewport, antes de cualquier script síncrono: WebKit hace
            el primer layout al toparse con el script, y si el meta aún no llegó
            usa el viewport por defecto (568pt) — la página pintaba a escala
            1.68x y se reacomodaba después: el parpadeo del arranque en la app. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* LA FRANJA DE ACCIONES, escrita aquí y no en la hoja de estilos.
            Se rompió una y otra vez por lo mismo: su relleno dependía de clases
            de Tailwind recién agregadas, y en desarrollo esas clases NO llegan
            al CSS servido hasta reiniciar el servidor —el componente nuevo
            aparecía en pantalla con su CSS todavía sin existir: botones contra
            el filo, sin aire arriba y sin línea—. Dentro del documento la
            regla llega siempre junto con la página, no pasa por esa hoja, y al
            ir fuera de las capas de Tailwind ninguna clase suelta puede
            pisarla. Medidas: las de «Publicar» en Crear proyecto. */}
        {/* LOS BORDES DE LOS TABLEROS EN COMPUTADORA (Empleos, Promociones,
            Proyectos), por la misma razón que la franja: si la clase de color
            de un borde todavía no llegó a la hoja servida, Tailwind pinta ese
            borde con el color del TEXTO —azul marino— y la tarjeta conserva su
            línea de arriba, que se suma a la de la barra de filtros. Aquí: un
            solo gris para todas las uniones y ninguna línea doble arriba. */}
        <style
          data-ccr-tableros=""
          dangerouslySetInnerHTML={{
            __html: `@media (min-width:1024px){.ccr-panel-tablero{border-style:solid;border-color:#e3ebf2;border-width:0 1px;border-radius:0;box-shadow:none}.ccr-panel-tablero.ccr-con-conteo{border-top-width:1px}.ccr-panel-tablero .ccr-lista-tablero{border-right:1px solid #e3ebf2}}`,
          }}
        />
        {/* LOS CARRILES EN COMPUTADORA. En pantalla grande con mouse nadie
            desliza con el dedo, así que:
            · los filtros en pastillas (`ccr-carril-chips`) NO se desplazan:
              bajan a otro renglón y quedan todos a la vista;
            · lo que sí tiene que ir en una línea —pestañas, miniaturas—
              (`ccr-carril`) enseña una barrita fina al pasar el cursor y se
              puede arrastrar con el mouse (use-arrastre-horizontal).
            El espacio de la barrita se reserva siempre, para que nada salte al
            aparecer. Solo aplica con mouse: en táctil manda el dedo. */}
        {/* UN VACÍO NO LLEVA TARJETA DENTRO DE OTRA. En computadora la sección
            del panel YA es una tarjeta blanca con su borde; el estado vacío
            dibujaba la suya adentro y quedaba un recuadro dentro de otro con
            aire muerto entre los dos (se veía en Soporte y en Cotizaciones sin
            registros). Sobre el gris del teléfono la tarjeta sí hace falta, así
            que la regla es solo de computadora, donde el fondo de la sección ya
            es blanco. */}
        <style
          data-ccr-vacios=""
          dangerouslySetInnerHTML={{
            __html: `@media (min-width:1024px){.dashboard-section-content .ccr-empty-state{border-width:0!important;box-shadow:none!important;background:transparent!important}}`,
          }}
        />
        <style
          data-ccr-carriles=""
          dangerouslySetInnerHTML={{
            __html: `.ccr-carril-chips .ccr-ver-mas{display:none!important}@media (min-width:1024px) and (hover:hover) and (pointer:fine){.ccr-carril-chips [data-plegado]{display:none!important}.ccr-carril-chips .ccr-ver-mas{display:inline-flex!important}.ccr-carril-chips{flex-wrap:wrap!important;overflow:visible!important;-webkit-mask-image:none!important;mask-image:none!important}.ccr-carril{scrollbar-width:thin!important;scrollbar-color:transparent transparent}.ccr-carril:hover{scrollbar-color:#c5d2de transparent}.ccr-carril::-webkit-scrollbar{display:block!important;height:6px}.ccr-carril::-webkit-scrollbar-track{background:transparent}.ccr-carril::-webkit-scrollbar-thumb{background:transparent;border-radius:999px}.ccr-carril:hover::-webkit-scrollbar-thumb{background:#c5d2de}.ccr-carril:hover::-webkit-scrollbar-thumb:hover{background:#9fb1c2}}`,
          }}
        />
        {/* La fila de acciones de TODA tarjeta del panel —Mis proyectos, Mis
            citas, Mis empleos, Mis promociones, Solicitudes, Propuestas—, con
            una sola medida: línea fina encima, botones de 44 px con letra de
            13 px en negrita, «···» de 44 px con el mismo borde, y el aire de
            abajo lo pone la tarjeta, no la fila. En computadora, a su tamaño y a
            la derecha. Antes eran tres familias: 44/13 en Proyectos, 40/12 en
            Empleos y Promociones, y Empleos con 20 px más de aire abajo.
            Va aquí y no en clases de Tailwind para que un CSS viejo no la
            deshaga (lo que ya rompió el encabezado del panel una vez). */}
        <style
          data-ccr-acciones=""
          dangerouslySetInnerHTML={{
            __html: `.ccr-acciones-tarjeta{border-top:1px solid #eef2f6!important;padding-top:16px!important;margin-bottom:0!important}.ccr-acciones-tarjeta :is(a,button):not([aria-haspopup]):not([role=menuitem]){height:44px!important;min-height:44px!important;font-size:13px!important;font-weight:700!important}.ccr-acciones-tarjeta button[aria-haspopup=menu]{width:44px!important;height:44px!important;border-color:#e5e7eb!important}.ccr-acciones-tarjeta.grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 44px!important}@media (min-width:1024px){.ccr-acciones-tarjeta{display:flex!important;flex-direction:row!important;justify-content:flex-end!important;align-items:center!important}.ccr-acciones-tarjeta :is(a,button):not([aria-haspopup]):not([role=menuitem]){width:auto!important;min-width:176px;flex:none!important;padding-left:24px!important;padding-right:24px!important}}`,
          }}
        />
        {/* UNA separación entre botones en toda la app: 12 px, la que ya traía
            el pie de las ventanas. Cada franja la ponía por su cuenta —o no la
            ponía: en «Publicar empleo», Cancelar y Publicar se tocaban—. Vale
            para la franja de abajo, el pie de toda ventana y la fila de
            acciones de las tarjetas del panel, y va en el documento para que
            un CSS viejo no la quite. */}
        <style
          data-ccr-separacion=""
          dangerouslySetInnerHTML={{
            __html: `:is(.ccr-barra-accion,.ccr-pie-ventana,.ccr-acciones-tarjeta,.ccr-grupo-botones),:is(.ccr-barra-accion,.ccr-pie-ventana,.ccr-acciones-tarjeta,.ccr-grupo-botones) div:not([role=menu]):not([role=menu] *){column-gap:12px!important;row-gap:12px!important}`,
          }}
        />
        {/* Lista de notificaciones, como Facebook: el punto azul de lo no leído
            en la MISMA columna que el «···» general de arriba (su centro queda
            a 30 px del borde de la tarjeta: 16 de margen + 14 de medio botón),
            y el «···» de cada fila a su izquierda. Con ratón, ese «···» solo
            aparece al pasar por la fila o al enfocarla con el teclado —quince
            en columna competían con los puntos—; en pantallas táctiles, donde
            no hay cursor, se queda siempre a la vista. */}
        <style
          data-ccr-notificaciones=""
          dangerouslySetInnerHTML={{
            __html: `.ccr-notifications-items [data-punto-no-leida]{right:25px!important}.ccr-notifications-items [data-menu-fila]{top:50%!important;right:42px!important;transform:translateY(-50%)}@media (hover:hover) and (pointer:fine){.ccr-notifications-items li [data-menu-fila]:not([data-abierto]){opacity:0;transition:opacity .15s}.ccr-notifications-items li:hover [data-menu-fila],.ccr-notifications-items li:focus-within [data-menu-fila]{opacity:1}}`,
          }}
        />
        {/* El verde de WhatsApp de la marca, en el documento: un botón con
            letra blanca que pierde su fondo (CSS viejo en caché) se vuelve
            invisible. Pasó en la franja de la ficha: solo quedaba «Llamar». */}
        <style
          data-ccr-whatsapp=""
          dangerouslySetInnerHTML={{
            __html: `.ccr-boton-whatsapp{background-color:#25D366!important;color:#fff!important}.ccr-boton-whatsapp:hover{background-color:#1EBE5B!important}.ccr-boton-whatsapp:focus-visible{--tw-ring-color:#25D366}`,
          }}
        />
        {/* Con la franja de acciones fija abajo (teléfono), la página reserva
            debajo exactamente su alto: así se puede desplazar hasta el final
            sin que la franja tape lo último («Reportar perfil» en la ficha). */}
        <style
          data-ccr-reserva=""
          dangerouslySetInnerHTML={{
            __html: `@media (max-width:639px){body.ccr-con-barra-accion{padding-bottom:var(--ccr-alto-barra,0px)}}`,
          }}
        />
        {/* Teclado abierto en un formulario largo (teléfono): fuera la franja de
            botones, que volvía al cerrar el teclado. La marca la pone
            ViewportEnvironment. La reserva no aplica al chat ni a la reserva de
            citas, que tienen su propio acomodo. */}
        {/* La portada es blanca: mientras llega, la espera también. Con el lienzo
            gris del panel, la primera visita veía un pantallazo gris —y la foto
            del arco «en gris»— antes de la portada. */}
        {/* Cuánto tiene que subir el aviso de «Guardado» para no quedar detrás de
            algo fijo al pie. Solo vale mientras eso está puesto: la barra de la
            app (nativa) y la franja de acciones del teléfono. */}
        {/* El hilo de soporte y el chat, pegados arriba cuando no hay teclado.
            Viaja dentro del documento porque es geometría crítica que se prueba
            en el iPhone: una hoja de utilidades que llegue tarde deja la
            pantalla partida. Misma regla que en globals.css. */}
        <style
          data-ccr-hilo=""
          dangerouslySetInnerHTML={{
            __html: `@media (max-width:1023px){html:not([data-keyboard-open]).contratacr-chat-thread-open :is(.ccr-support-thread,.direct-chat-shell--thread){top:0!important;left:0!important}html:not([data-keyboard-open]).contratacr-chat-thread-open body:not(.ccr-native-app) :is(.ccr-support-thread,.direct-chat-shell--thread){height:100dvh!important;max-height:100dvh!important}}`,
          }}
        />
        <style
          data-ccr-aviso-guardado=""
          dangerouslySetInnerHTML={{
            __html: `html.ccr-native-bottom-nav-visible{--ccr-aviso-barra-app:var(--ccr-native-live-bottom-nav-height,0px)}@media (max-width:639px){body.ccr-con-barra-accion{--ccr-aviso-franja:var(--ccr-alto-barra,0px)}}`,
          }}
        />
        <style
          data-ccr-portada=""
          dangerouslySetInnerHTML={{
            __html: `html.ccr-ruta-portada .ccr-page-route-loading{background:#fff!important}`,
          }}
        />
        <style
          data-ccr-teclado=""
          dangerouslySetInnerHTML={{
            __html: `@media (max-width:767px){html[data-teclado-formulario-largo] :is(.ccr-pie-ventana,.ccr-barra-accion):not(.ccr-booking-modal-panel *){display:none!important}}`,
          }}
        />
        <style
          data-ccr-franja=""
          dangerouslySetInnerHTML={{
            __html: `@media (max-width:639px){.ccr-barra-accion{box-sizing:border-box;background:#fff;border-top:1px solid #e5e7eb;padding:16px max(20px,env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 28px) max(20px,env(safe-area-inset-left))}.ccr-barra-accion.ccr-sin-linea{border-top-color:transparent}.ccr-barra-fija{position:fixed;left:0;right:0;bottom:var(--ccr-reserva-barra,0px);z-index:20}}`,
          }}
        />
        <script
          type="text/javascript"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{var k=${JSON.stringify(NATIVE_ONBOARDING_COMPLETED_KEY)};var p=new URLSearchParams(window.location.search);var local=/^(localhost|127\\.0\\.0\\.1)$/i.test(window.location.hostname);if(local&&p.get("resetNativeOnboarding")==="1"&&window.localStorage){window.localStorage.removeItem(k)}if(local&&p.get("nativePreview")==="1"){document.documentElement.classList.add("ccr-native-app");window.sessionStorage&&window.sessionStorage.setItem("ccr:native-preview","1")}else if(local&&window.sessionStorage&&window.sessionStorage.getItem("ccr:native-preview")==="1"){document.documentElement.classList.add("ccr-native-app")}if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){document.documentElement.classList.add("ccr-native-app")}if(/(?:^|;\\s*)ccr_platform=native(?:;|$)/.test(document.cookie||"")){document.documentElement.classList.add("ccr-native-app")}if(document.documentElement.classList.contains("ccr-native-app")&&window.localStorage&&window.localStorage.getItem(k)!=="1"){document.documentElement.classList.add("ccr-native-first-run-pending")}}catch(e){}`,
          }}
        />
      </head>
      {/* El script de abajo agrega clases al body antes de hidratar (por ruta,
          p. ej. en /buscar); React no las corrige, solo avisaría en consola. */}
      <body className={`min-h-full flex flex-col bg-white${clasesNativas}`} suppressHydrationWarning>
        {/* Corre apenas el <body> existe, antes del primer cuadro: siembra las
            clases del armazón nativo que hasta ahora ponía la hidratación. Sin
            esto, la portada pintaba una vez con acomodo web y un instante
            después saltaba al nativo (barra de abajo, contenedor fijo) — el
            parpadeo del arranque. La hidratación después solo confirma.
            Ojo con las barras: dentro de la plantilla hay que escribir \\/ para que
            al navegador le llegue \\/ y la expresión regular no quede rota. */}
        <script
          type="text/javascript"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{if(/^\\/(es|en)?\\/?$/.test(window.location.pathname)){document.documentElement.classList.add("ccr-ruta-portada")}}catch(e){}try{if(document.documentElement.classList.contains("ccr-native-app")){document.body.classList.add("ccr-native-app");var r=window.location.pathname;if(!/(^|\\/)(publicar-proyecto|(empleos|ofertas)\\/publicar)(\\/|$)/.test(r)){document.documentElement.classList.add("ccr-native-bottom-nav-visible");document.body.classList.add("ccr-native-bottom-nav-visible")}if(/(^|\\/)buscar(\\/|$)/.test(r)){document.documentElement.classList.add("ccr-native-search-route");document.body.classList.add("ccr-native-search-route")}}}catch(e){}`,
          }}
        />
        <StaticNativeFirstRunPrepaint />
        <NativeDebugLogger />
        <Suspense fallback={<InitialRouteLoading />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}

function StaticNativeFirstRunPrepaint() {
  return (
    <div id="ccr-native-first-run-prepaint" aria-hidden="true">
      <div className="ccr-native-first-run-prepaint-bg" />
      <div className="ccr-native-first-run-prepaint-shade" />
      <div className="ccr-native-first-run-prepaint-content">
        <div className="ccr-native-first-run-prepaint-logo">
          {/* Como fondo y no como <img>: este bloque solo se ve en la app al
              primer arranque, pero su HTML viaja en TODAS las páginas web, y era
              la primera imagen del documento. Una red social que no encuentra
              imagen de enlace agarra esa: el símbolo de R blanca, que sobre el
              blanco de la tarjeta no se ve. Como fondo, además, la web ni lo
              descarga (el bloque está en display:none). */}
          <span className="ccr-native-first-run-prepaint-marca" aria-hidden="true" />
          <span>
            Contrata<span>CR</span>
          </span>
        </div>
        <p>Elige como quieres comenzar</p>
        <div className="ccr-native-first-run-prepaint-actions">
          <span>Buscar servicios</span>
          <span>Ofrecer servicios</span>
        </div>
        <div className="ccr-native-first-run-prepaint-cta">Crear una cuenta</div>
        <div className="ccr-native-first-run-prepaint-login">
          Ya tienes una cuenta? <span>Inicia sesion</span>
        </div>
      </div>
    </div>
  );
}

function InitialRouteLoading() {
  // Ninguna espera muestra la marca: en la app la marca es del splash nativo y
  // en la web el logotipo a pantalla completa se leía como una pantalla de carga
  // más. Se pinta el lienzo con la barra y el contenido llega con esqueletos.
  return (
    <main className="ccr-page-route-loading fixed inset-0 z-[100000] bg-[#f4f7fa]" aria-busy="true" role="status">
      <div className="h-16 bg-white shadow-[0_1px_0_#e5e7eb]" />
      <span className="sr-only">Cargando...</span>
    </main>
  );
}
