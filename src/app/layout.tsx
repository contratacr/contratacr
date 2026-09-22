import { Suspense, type ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { Inter } from "next/font/google";
import { NativeDebugLogger } from "@/components/mobile/native-debug-logger";
import { NATIVE_ONBOARDING_COMPLETED_KEY } from "@/lib/mobile-onboarding";
import { catalogoParaElCliente } from "@/lib/data/server-category-catalog";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

// «<» escrito como secuencia de escape de JSON (barra invertida + u003c), para
// que ningún nombre del catálogo pueda cerrar la etiqueta <script>. Se arma por
// partes a propósito: escrita de corrido, el chequeo de codificación del repo
// (scripts/check-text-encoding.mjs) la toma por un texto dañado y no deja ni
// arrancar el servidor ni compilar.
const MENOR_QUE_ESCAPADO = `${String.fromCharCode(92)}u003c`;

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
  // Con tope de 3 s y caché de 20 s por instancia: casi siempre es gratis, y si
  // la base tarda, la página sale igual (sin catálogo, como antes).
  const catalogoEnTexto = await catalogoParaElCliente().catch(() => null);
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
            __html: `@media (min-width:1024px){.ccr-panel-tablero:not(.ccr-ficha-pagina){border-style:solid;border-color:#e3ebf2;border-width:0 1px;border-radius:0;box-shadow:none}.ccr-panel-tablero.ccr-con-conteo:not(.ccr-ficha-pagina){border-top-width:1px}.ccr-panel-tablero .ccr-lista-tablero{border-right:1px solid #e3ebf2}}`,
          }}
        />
        {/* LOS CARRILES EN COMPUTADORA. En pantalla grande con mouse nadie
            desliza con el dedo, así que:
            · los filtros en pastillas (`ccr-carril-chips`) van SIEMPRE en una
              sola línea, también en computadora: envueltos, seis servicios ya
              eran tres renglones y la fila de filtros empujaba el contenido
              hacia abajo. Es el carril de YouTube, LinkedIn y Airbnb: una
              línea, degradado a la derecha y flechas con el cursor encima;
            · lo que sí tiene que ir en una línea —pestañas, miniaturas—
              (`ccr-carril`) se puede arrastrar con el mouse
              (use-arrastre-horizontal). La barrita fina al pasar el cursor
              queda SOLO donde no hay degradado: donde el carril ya se
              desvanece (`data-ccr-degradado`, que el propio carril pone
              cuando midió que hay más), la barra sobraba —aparecía y se iba
              sola, y eran dos señales para lo mismo, una de ellas
              parpadeando—. Degradado y flechas, que es lo que recomiendan
              hoy: la barra solo se esconde cuando hay OTRA señal.
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
        {/* EL GEMELO DEL BUSCADOR DE LOS TABLEROS se esconde solo. En Empleos,
            Promociones y Proyectos el buscador de la barra llega por un portal
            —lo dibuja la página, la barra vive en el layout—, y un portal no
            existe en el servidor: la barra se pintaba con un hueco y el
            buscador aparecía ~200 ms después. Ahora el servidor pinta un gemelo
            exacto y, cuando el hueco del portal deja de estar vacío, esta regla
            lo vuelve invisible. Va aquí y no en clases para que no dependa de
            ningún estado ni de ningún efecto: si hubiera un segundo render,
            sería un segundo parpadeo. */}
        {/* COMPARTIR DICE LO QUE VA A HACER, Y NO PARPADEA.
            En computadora no existe la hoja del sistema: el botón copia el
            enlace, así que tiene que decir «Copiar enlace», como LinkedIn. En
            el teléfono abre la hoja y dice «Compartir». El servidor no puede
            saber cuál toca —`navigator.share` solo existe en el navegador—, y
            decidirlo al hidratar hacía que el rótulo y el icono cambiaran
            delante de la persona en cada carga.
            Por eso se pintan LAS DOS y elige el CSS, con la misma condición que
            el resto del app usa para «esto es una computadora»: que haya ratón.
            Así el servidor manda las dos caras y nunca cambia nada después. */}
        <style
          data-ccr-compartir=""
          dangerouslySetInnerHTML={{
            __html: `.ccr-compartir-raton{display:none}@media (hover:hover) and (pointer:fine){.ccr-compartir-dedo{display:none}.ccr-compartir-raton{display:inline-flex;align-items:center;gap:inherit}}`,
          }}
        />
        <style
          data-ccr-gemelo=""
          dangerouslySetInnerHTML={{
            __html: `#ccr-marketplace-navbar-slot:not(:empty)~[data-gemelo-buscador]{visibility:hidden!important}`,
          }}
        />
        <style
          data-ccr-carriles=""
          dangerouslySetInnerHTML={{
            __html: `.ccr-carril-chips .ccr-ver-mas{display:none!important}@media (min-width:1024px) and (hover:hover) and (pointer:fine){.ccr-carril{scrollbar-width:thin!important;scrollbar-color:transparent transparent}.ccr-carril:hover{scrollbar-color:#c5d2de transparent}.ccr-carril::-webkit-scrollbar{display:block!important;height:6px}.ccr-carril::-webkit-scrollbar-track{background:transparent}.ccr-carril::-webkit-scrollbar-thumb{background:transparent;border-radius:999px}.ccr-carril:hover::-webkit-scrollbar-thumb{background:#c5d2de}.ccr-carril:hover::-webkit-scrollbar-thumb:hover{background:#9fb1c2}[data-ccr-degradado]{scrollbar-width:none!important}[data-ccr-degradado]::-webkit-scrollbar{display:none!important}}`,
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
            __html: `.ccr-notifications-items [data-punto-no-leida]{right:52px!important}.ccr-notifications-items [data-menu-fila]{top:50%!important;right:12px!important;transform:translateY(-50%)}@media (hover:hover) and (pointer:fine){.ccr-notifications-items li [data-menu-fila]:not([data-abierto]){opacity:0;transition:opacity .15s}.ccr-notifications-items li:hover [data-menu-fila],.ccr-notifications-items li:focus-within [data-menu-fila]{opacity:1}}`,
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
            sin que la franja tape lo último («Reportar perfil» en la ficha).

            Y NADIE SE DESPLAZA HACIA LA NADA. Las pantallas ya se fuerzan a
            medir el teléfono entero (min-h-screen, min-h-[calc(100vh-72px)]…):
            sumada a eso, la reserva dejaba a una pantalla CORTA 93 px más alta
            que el teléfono, y se podía arrastrar hacia un vacío. Con la franja
            puesta, cada alto mínimo DESCUENTA la reserva: la pantalla corta
            mide justo el teléfono y la larga termina sobre la franja. Se
            descuenta —no se anula— porque ese mínimo es lo que hace que el
            blanco de una ficha corta llene la pantalla. Si se agrega una
            variante nueva de min-h-[calc(100…)], hay que sumarla aquí. */}
        <style
          data-ccr-reserva=""
          dangerouslySetInnerHTML={{
            __html: `@media (max-width:639px){body.ccr-con-barra-accion{padding-bottom:var(--ccr-alto-barra,0px)}body.ccr-con-barra-accion .min-h-screen{min-height:calc(100vh - var(--ccr-alto-barra,0px))!important}.ccr-cascaron-contenido{display:flex;flex-direction:column;min-width:0}.ccr-cascaron-contenido>main{flex:1 1 auto;min-width:0}body.ccr-con-barra-accion [class*="min-h-[calc(100vh-72px)]"]{min-height:calc(100vh - 72px - var(--ccr-alto-barra,0px))!important}body.ccr-con-barra-accion [class*="min-h-[calc(100svh-88px)]"]{min-height:calc(100svh - 88px - var(--ccr-alto-barra,0px))!important}body.ccr-con-barra-accion [class*="min-h-[calc(100dvh-8.75rem)]"]{min-height:calc(100dvh - 8.75rem - var(--ccr-alto-barra,0px))!important}body.ccr-con-barra-accion [class*="min-h-[calc(100dvh-64px)]"]{min-height:calc(100dvh - 64px - var(--ccr-alto-barra,0px))!important}body.ccr-con-barra-accion [class*="min-h-[calc(100dvh-4rem)]"]{min-height:calc(100dvh - 4rem - var(--ccr-alto-barra,0px))!important}body.ccr-con-barra-accion [class*="min-h-[calc(100dvh-16rem)]"]{min-height:calc(100dvh - 16rem - var(--ccr-alto-barra,0px))!important}body.ccr-con-barra-accion [class*="min-h-[calc(100dvh-153px)]"]{min-height:calc(100dvh - 153px - var(--ccr-alto-barra,0px))!important}}`,
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
        {/* LA BARRA DE DESPLAZAMIENTO DE UN CHAT NO SE QUEDA A LA VISTA.
            El app pinta una barra propia y SIEMPRE visible —7 px, gris #94a3b8
            y 72 px de alto minimo—, asi que en la conversacion aparecia una
            barrita gris corta flotando junto a los globos: parecia una sombra
            suelta, no una barra. WhatsApp y Messenger la esconden hasta que uno
            pasa el cursor por encima, que es lo que se hace aqui: transparente
            en reposo y gris claro al acercarse. El espacio sigue reservado, asi
            que nada se mueve cuando aparece.
            Va en el documento y no en clases de Tailwind porque una utilidad
            recien estrenada puede no llegar al CSS servido (ver la regla de la
            franja de acciones, mismo motivo). */}
        <style
          data-ccr-barra-chat=""
          dangerouslySetInnerHTML={{
            __html: `:is(.ccr-support-thread-messages,.ccr-direct-chat-thread-scroll,.ccr-direct-chat-list){scrollbar-color:transparent transparent}:is(.ccr-support-thread-messages,.ccr-direct-chat-thread-scroll,.ccr-direct-chat-list):hover{scrollbar-color:#cbd5e1 transparent}:is(.ccr-support-thread-messages,.ccr-direct-chat-thread-scroll,.ccr-direct-chat-list)::-webkit-scrollbar-thumb{background:transparent;transition:background .18s ease-out}:is(.ccr-support-thread-messages,.ccr-direct-chat-thread-scroll,.ccr-direct-chat-list):hover::-webkit-scrollbar-thumb{background:#cbd5e1}`,
          }}
        />
        {/* /BUSCAR EN EL TELÉFONO LLENA LA PANTALLA HASTA ABAJO.
            El área del mapa medía «pantalla − cabecera», pero arranca en y=0,
            DEBAJO de la cabecera fija (el espaciador se quitó en el teléfono
            para evitar un salto). Resultado: terminaba 124 px antes del fondo y
            ahí asomaba el pie del sitio, azul oscuro. El panel de resultados lo
            tapaba casi siempre; al bajarlo, quedaba una franja oscura entre el
            mapa y el panel. Ahora el área mide la pantalla entera y el relleno
            de arriba deja el mapa justo bajo la cabecera. El pie, que ahí nunca
            se puede alcanzar —la página no se desplaza—, no se dibuja: así no
            hay nada que pueda asomar debajo de otro contenedor. Solo en la web:
            la app tiene su propia barra abajo y su propia regla. */}
        <style
          data-ccr-buscar=""
          dangerouslySetInnerHTML={{
            // OJO: nada aquí puede depender de `body.ccr-search-sheet-page`. Esa
            // clase la pone JavaScript en un efecto, DESPUÉS del primer pintado: con
            // ella de condición, el mapa se pintaba en y=0 —debajo de la barra fija—
            // y un instante después bajaba 124 px (CLS 0,172 en cada carga de /buscar
            // en el teléfono). El contenedor `.ccr-search-results-layout` ya viene en
            // el HTML del servidor y solo existe en /buscar, así que alcanza con él;
            // para el pie, `:has()`.
            __html: `@media (max-width:1023px){body:not(.ccr-native-app) .ccr-search-results-layout{height:100dvh!important;box-sizing:border-box;padding-top:var(--ccr-native-header-height,124px)}body:has(.ccr-search-results-layout) .ccr-app-footer{display:none!important}}`,
          }}
        />
        {/* EL PANEL NO LLEVA PIE EN EL TELÉFONO. El pie del sitio es una lista
            de salidas —Servicios, Ayuda, redes— y el panel es la herramienta de
            trabajo. Dentro de una sección ya se comportaba como pantalla
            completa (la sección mide la pantalla entera aunque su contenido sea
            corto), así que el pie solo aparecía tras recorrerla entera; en la
            raíz salía enseguida: dos comportamientos para lo mismo. La app
            nativa ya lo esconde. De 1024 px en adelante se queda, que ahí el
            panel vive dentro de la página y el pie cierra el documento. */}
        <style
          data-ccr-pie-panel=""
          dangerouslySetInnerHTML={{
            __html: `@media (max-width:1023px){.ccr-dashboard-footer{display:none!important}}`,
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
            __html: `@media (max-width:639px){.ccr-barra-accion{box-sizing:border-box;background:#fff;border-top:1px solid #e5e7eb;padding:16px max(20px,env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 28px) max(20px,env(safe-area-inset-left))}.ccr-barra-accion.ccr-sin-linea{border-top-color:transparent}:is(.ccr-barra-fija,.ccr-barra-ventana){position:fixed;left:0;right:0;bottom:var(--ccr-reserva-barra,0px);z-index:20;transition:box-shadow .18s ease-out}body:not([data-ccr-al-final]) .ccr-barra-fija{box-shadow:0 -8px 12px -6px rgba(15,23,42,.18)}}
/* ccr-barra-ventana es la MISMA franja, pero dentro de una ventana: se coloca
   igual y NO lleva la sombra de estas reglas, porque estas miran el
   desplazamiento de la PÁGINA. Dentro de una ventana la página de atrás no
   dice nada: lo que importa es si queda contenido bajo la franja de la ventana,
   y eso lo decide data-ccr-hay-mas, que el propio Modal pone al medir su
   cuerpo. Sin esta separación, abrir «Contactar soporte» sobre una página larga
   pintaba la sombra aunque el formulario cupiera entero. */
/* La sombra del pie estaba encerrada en el @media del teléfono: de 640 px en
   adelante las franjas de los formularios siguen pegadas (sticky bottom-0),
   siguen tapando el final y se habían quedado sin ella. La marca
   ccr-pie-pegado la lleva solo quien se pega también en pantalla grande; una
   franja que pasado el teléfono se va al final del contenido no la lleva. */
.ccr-pie-pegado{transition:box-shadow .18s ease-out}
@media (min-width:640px){body:not([data-ccr-al-final]) .ccr-pie-pegado{box-shadow:0 -8px 12px -6px rgba(15,23,42,.18)}}
.ccr-pie-ventana,.ccr-pie-formulario,.ccr-cabecera-pegada{transition:box-shadow .18s ease-out}
body[data-ccr-desplazado] .ccr-cabecera-pegada{box-shadow:0 8px 12px -6px rgba(15,23,42,.18)}
/* La pantalla de error se centra en la VENTANA, no debajo de la barra. Pide
   100vh de alto y, si además queda el hueco que reserva la barra, el bloque
   entero baja justo esa altura y deja un claro arriba. En una pantalla de error
   no hay barra que reservar: lo único que hay es el aviso. */
body:has(.ccr-error-screen) .ccr-navbar-spacer{display:none}
/* Los filtros de /buscar cuelgan del filtro que los abrió, como en Empleos:
   en computadora el panel se coloca bajo el chip y el velo se vuelve
   transparente, así la lista se sigue viendo mientras se elige. En el teléfono
   no se toca: hoja desde abajo con su velo. La posición viaja en dos variables
   que pone el componente, no en clases generadas. */
@media (min-width:1024px){
 .ccr-filtro-anclado{position:absolute;left:var(--ccr-anc-x,0px);top:var(--ccr-anc-y,0px);width:22rem;max-width:22rem;border-radius:14px}
 .ccr-filtro-anclado-velo{background:transparent}
}
[data-ccr-hay-mas] .ccr-pie-ventana,[data-ccr-hay-mas] .ccr-pie-formulario{box-shadow:0 -8px 12px -6px rgba(15,23,42,.18)}`,
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
        {/* EL CATÁLOGO DE SERVICIOS VIAJA CON LA PÁGINA.
            Los nombres de los servicios viven en la base (se renombran y se
            agregan desde el panel de administración). El servidor pinta con
            ese catálogo, pero el navegador hidrataba SIN él y lo pedía después:
            en el primer render ponía el nombre fijo o uno armado del
            identificador —«Nutrición y dietética» donde el servidor dijo
            «Nutrición», «Radios de comunicacion» sin tilde—. Textos distintos =
            «Hydration failed»: React tira TODA la pantalla del servidor y la
            repinta. Pasaba en cada carga de la portada y de /buscar, las dos
            pantallas más visitadas, con sesión y sin ella, en teléfono y en
            computadora: el parpadeo de pantalla completa.
            Va al principio del <body> para que exista antes de que corra
            cualquier script: el registro lo lee al evaluarse el módulo, antes
            de hidratar (ver el final de lib/data/categories.ts). Son ~10 KB
            comprimidos. Se escapa «<» para que ningún nombre pueda cerrar la
            etiqueta. */}
        {catalogoEnTexto && (
          <script
            id="ccr-catalogo"
            type="application/json"
            dangerouslySetInnerHTML={{ __html: catalogoEnTexto.replace(/</g, MENOR_QUE_ESCAPADO) }}
          />
        )}
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
