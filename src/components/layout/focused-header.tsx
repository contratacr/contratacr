import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { CABECERA_BOTON, CABECERA_GLIFO, CABECERA_TITULO, COLUMNAS_CABECERA } from "@/components/layout/cabecera";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/layout/navbar";

// La cabecera de las pantallas en que alguien está a media cosa: elegir rol,
// completar un perfil, el registro profesional. Sin menú y sin campana —la
// cuenta todavía no sirve del todo y cada control de más es una salida.
//
// Con `title` toma la forma que ya tienen las secciones del panel: rejilla de
// tres columnas, flecha a la izquierda, título al centro y el hueco de la
// derecha vacío para que el título quede centrado de verdad. Antes el título
// vivía dentro de la tarjeta y arriba solo estaba el logo, así que la pantalla
// no decía en qué parte del trámite estaba hasta después de leer el cuerpo, y
// la flecha quedaba flotando al lado de un logo que no significaba nada ahí.
//
// Sin `title` se queda como estaba: el logo centrado y nada más. Es la primera
// pantalla después de crear la cuenta (onboarding), donde no hay sección a la
// que ponerle nombre ni lugar al que volver.
export function FocusedHeader({ title, backHref, onBack, backLabel = "Volver", soloTelefono = false }: {
  title?: string;
  /**
   * En computadora estas pantallas llevan la barra principal —la misma que
   * cuando se entra sin sesión—; esta cabecera de flecha y título es el patrón
   * del teléfono. Con `soloTelefono` se esconde desde 1024 px.
   */
  soloTelefono?: boolean;
  backHref?: string;
  // Dentro de un trámite de varios pasos la flecha RETROCEDE UN PASO; solo en
  // el primero sale de la pantalla. Una sola flecha con un solo significado:
  // tener la del encabezado saliendo y otra abajo retrocediendo era el mismo
  // dibujo queriendo decir dos cosas.
  onBack?: () => void;
  backLabel?: string;
}) {
  if (!title) {
    return (
      <header className={cn("flex justify-center border-b border-gray-100 bg-white px-4 py-4", soloTelefono && "lg:hidden")}>
        <Link href="/" aria-label="ContrataCR">
          <ContrataCRLogo />
        </Link>
      </header>
    );
  }
  return (
    <header
      // `ccr-cabecera-pegada`: levanta sombra solo cuando de verdad hay algo
      // pasando por debajo (regla en layout.tsx, igual que la franja del pie).
      className={cn("ccr-cabecera-pegada sticky top-0 z-20 grid min-h-16 items-center border-b border-[#e5e7eb] bg-white px-4 py-2 text-[#162543]", soloTelefono && "lg:hidden")}
      // Las columnas van en `style`, no en una clase arbitraria de Tailwind: en
      // desarrollo una clase recién escrita llega a la pantalla antes que su
      // CSS, y sin columnas la flecha y el título se apilaban uno sobre otro.
      style={COLUMNAS_CABECERA}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className={cn(CABECERA_BOTON, "justify-self-start")}
        >
          <ArrowLeft className={CABECERA_GLIFO} />
        </button>
      ) : backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className={cn(CABECERA_BOTON, "justify-self-start")}
        >
          <ArrowLeft className={CABECERA_GLIFO} />
        </Link>
      ) : (
        <span />
      )}
      <h1 className={cn(CABECERA_TITULO, "text-center")}>{title}</h1>
      <span />
    </header>
  );
}

/**
 * La cabecera de un trámite: flecha y título en el teléfono, la barra principal
 * en computadora. En computadora el título NO va aquí: va dentro de la tarjeta
 * del trámite, encima de los pasos —como en la versión sin sesión—; en una
 * franja aparte quedaba flotando a 100 px de lo que nombraba. Antes la misma pantalla cambiaba de barra según si había
 * sesión: sin sesión, la principal; con sesión, una tira de flecha y título
 * estirada a 1440 px, con la flecha a 700 px del contenido.
 */
export function CabeceraDeTramite(props: Parameters<typeof FocusedHeader>[0]) {
  return (
    <>
      <FocusedHeader {...props} soloTelefono />
      <div className="hidden lg:block">
        <Navbar mobileSearch={false} />
      </div>
    </>
  );
}
