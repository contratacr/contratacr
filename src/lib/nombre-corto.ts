import { formatPersonDisplayName } from "./display-name";

/** Use the same public person name as profiles and messages. */
export function nombreCorto(nombre: string): string {
  return formatPersonDisplayName(nombre);
}
