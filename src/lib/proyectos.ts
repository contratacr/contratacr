import { nombreDeSaludo } from "@/lib/nombres";

/** Un proyecto tal como se ve en el tablero público. Sale el nombre y la foto
 *  de quien publica —decisión de producto: el profesional decide a quién le
 *  contesta y «Publicado por María» no le decía nada—; el teléfono, el correo,
 *  la cédula y la identidad del beneficiario NO salen nunca de aquí. */
export type ProyectoPublico = {
  id: string;
  title: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  provincia_id: string | null;
  canton_id: string | null;
  location_label: string | null;
  created_at: string;
  client_first_name: string;
  /** Nombre completo de quien publica, tal como está en su cuenta. */
  client_name: string;
  /** Su foto de cuenta, que muchas veces es la foto de su perfil profesional. */
  client_avatar_url: string | null;
  allow_direct_contact: boolean;
};

/** El primer nombre alcanza; el apellido no aporta nada en un tablero público. */
export function primerNombre(nombre?: string | null): string {
  return nombreDeSaludo(nombre) || "Cliente";
}
