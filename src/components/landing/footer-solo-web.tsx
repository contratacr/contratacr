"use client";

import { LandingFooter } from "@/components/landing/landing-footer";
import { useNativeApp } from "@/hooks/use-native-app";

/**
 * El pie de página, pero solo donde SIRVE.
 *
 * El pie es la salida del sitio: una lista de enlaces para irse a otro lado.
 * Eso ayuda en una página de CONTENIDO —la portada, Cómo funciona, Ayuda, una
 * página por oficio—, donde alguien llega, lee y decide a dónde va.
 *
 * En una HERRAMIENTA estorba: un tablero con lista larga, una bandeja o un
 * formulario. En el teléfono, además, el pie mide 1.067 px —más que la pantalla
 * entera—, así que al final de una lista es una pared de enlaces. Por eso
 * `soloEscritorio`: el pie sigue en el HTML (sus enlaces internos cuentan para
 * los buscadores) y se retira de la vista en el teléfono, donde no cabe.
 *
 * En la app nativa no va nunca: ahí la salida es la barra de abajo.
 */
export function FooterSoloWeb({ soloEscritorio = false }: { soloEscritorio?: boolean }) {
  const nativeApp = useNativeApp();
  if (nativeApp) return null;
  if (!soloEscritorio) return <LandingFooter />;
  return (
    <div className="hidden lg:block">
      <LandingFooter />
    </div>
  );
}
