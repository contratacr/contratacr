export const NAME_MAX_LENGTH = 80;
export const SHORT_TEXT_MAX_LENGTH = 120;
export const PROFILE_BIO_MAX_LENGTH = 800;
export const LONG_TEXT_MAX_LENGTH = 500;
/** Mensajes dentro de un caso de soporte (equipo y usuario). Se rechazan, nunca se recortan. */
export const SUPPORT_MESSAGE_MAX_LENGTH = 4000;

/** true si el texto, ya sin espacios al inicio y final, supera el máximo. */
export function exceedsTrimmedLength(value: unknown, max: number) {
  return String(value ?? "").trim().length > max;
}

export function limitText(value: string, max: number) {
  return value.slice(0, max);
}

export function limitTrimmedText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}
