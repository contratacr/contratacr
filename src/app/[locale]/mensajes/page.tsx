import { cookies } from "next/headers";
import { MensajesEnLaApp } from "./mensajes-en-la-app";
import { MensajesSoloEnLaApp } from "./mensajes-solo-en-la-app";

/**
 * Mensajes: SOLO en la app. En la web, una pantalla que dice dónde están.
 *
 * Decisión de producto: el chat vive en la app nativa, y desde la web el
 * contacto es WhatsApp. Pero un 404 aquí ya se probó y rompió tres puertas a
 * la vez —la campana «Nuevo mensaje», el panel con `?tab=chat` y el correo de
 * aviso— porque las tres traen a esta dirección. Quien recibía un mensaje veía
 * «Página no encontrada» y nunca supo que le escribieron.
 *
 * Por eso la web no da 404: dice que el mensaje existe y que se lee en la app.
 * No se lee ni se responde desde aquí; eso es lo que se quería.
 *
 * La app se reconoce por su cookie ya EN EL SERVIDOR, igual que el armazón
 * (ver `src/app/layout.tsx`): así la pantalla correcta viaja pintada y no hay
 * un cuadro de la otra. La pantalla web vuelve a mirar en el cliente por si la
 * cookie aún no existe en el primer arranque de la app.
 */
export default async function MessagesPage() {
  const esApp = (await cookies()).get("ccr_platform")?.value === "native";
  return esApp ? <MensajesEnLaApp /> : <MensajesSoloEnLaApp />;
}
