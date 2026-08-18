const REPAIRS: Array<[RegExp, string]> = [
  [/\bUre\?a\b/gi, "Ureña"],
  [/\bJardiner\?a\b/gi, "Jardinería"],
  [/\bPlomer\?a\b/gi, "Plomería"],
  [/\bTapicer\?a\b/gi, "Tapicería"],
  [/\bCategor\?a\b/gi, "Categoría"],
  [/\bRevisi\?n\b/gi, "Revisión"],
  [/\bCl\?nica\b/gi, "Clínica"],
  [/\bp\?gina\b/gi, "página"],
  [/\bdise\?o\b/gi, "diseño"],
  [/\brese\?as?\b/gi, "reseña"],
  [/\bsecci\?n\b/gi, "sección"],
  [/\binformaci\?n\b/gi, "información"],
  [/\bubicaci\?n\b/gi, "ubicación"],
  [/\bverificaci\?n\b/gi, "verificación"],
  [/\bconversaci\?n\b/gi, "conversación"],
  [/\bdescripci\?n\b/gi, "descripción"],
  [/\bpublicaci\?n\b/gi, "publicación"],
  [/\bopci\?n\b/gi, "opción"],
  [/\br\?pida\b/gi, "rápida"],
  [/\br\?pido\b/gi, "rápido"],
  [/\bdespu\?s\b/gi, "después"],
  [/\btambi\?n\b/gi, "también"],
  [/\bqui\?n\b/gi, "quién"],
  [/\bqu\?\b/gi, "qué"],
  [/\bcu\?ndo\b/gi, "cuándo"],
  [/\bc\?mo\b/gi, "cómo"],
  [/\bT\?cnico\b/g, "Técnico"],
  [/\bt\?cnico\b/g, "técnico"],
  [/\bel\?ctrica\b/gi, "eléctrica"],
  [/\bel\?ctrico\b/gi, "eléctrico"],
  [/\bFot\?grafa\b/gi, "Fotógrafa"],
  [/\bFot\?grafo\b/gi, "Fotógrafo"],
  [/\bfotograf\?a\b/gi, "fotografía"],
  [/\bMec\?nica\b/gi, "Mecánica"],
  [/\bmec\?nica\b/gi, "mecánica"],
  [/\bmec\?nico\b/gi, "mecánico"],
  [/\ba\?os\b/gi, "años"],
  [/\ba\?o\b/gi, "año"],
  [/\bcasos de \?xito\b/gi, "casos de éxito"],
  [/\bformaci\?n\b/gi, "formación"],
  [/\beducaci\?n\b/gi, "educación"],
  [/\bconfiguraci\?n\b/gi, "configuración"],
  [/\bconexi\?n\b/gi, "conexión"],
  [/\binstalaci\?n\b/gi, "instalación"],
  [/\bcontrase\?a\b/gi, "contraseña"],
  [/\bb\?squeda\b/gi, "búsqueda"],
  [/\bb\?sico\b/gi, "básico"],
  [/\bb\?sicos\b/gi, "básicos"],
  [/\bM\?s\b/g, "Más"],
  [/\bm\?s\b/g, "más"],
  [/\best\?\b/gi, "está"],
  [/\bc\?dula\b/gi, "cédula"],
  [/\bpa\?s\b/gi, "país"],
  [/\bd\?a\b/gi, "día"],
];

const MOJIBAKE_HINT = /(?:Ã[\u0080-\u017f]|Â[\u0080-\u017f]|â[\u0080-\u017f]|ï¿½|�)/u;
const WINDOWS_1252_BYTES = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function mojibakeScore(value: string): number {
  return (value.match(/(?:Ã[\u0080-\u017f]|Â[\u0080-\u017f]|â[\u0080-\u017f]|ï¿½|�)/gu)?.length ?? 0) * 3;
}

function decodeWindows1252AsUtf8(value: string): string | null {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) bytes.push(code);
    else if (WINDOWS_1252_BYTES.has(code)) bytes.push(WINDOWS_1252_BYTES.get(code)!);
    else return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function repairMojibake(value: string): string {
  let current = value;
  for (let pass = 0; pass < 4 && MOJIBAKE_HINT.test(current); pass += 1) {
    const decoded = decodeWindows1252AsUtf8(current);
    if (!decoded || mojibakeScore(decoded) >= mojibakeScore(current)) break;
    current = decoded;
  }
  return current;
}

export function repairVisibleText<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  let next: string = repairMojibake(value);
  for (const [pattern, replacement] of REPAIRS) {
    next = next.replace(pattern, (match) => {
      const plural = match.toLocaleLowerCase().endsWith("s") && !replacement.toLocaleLowerCase().endsWith("s") ? "s" : "";
      const repaired = `${replacement}${plural}`;
      return match[0] === match[0].toLocaleUpperCase()
        ? `${repaired[0].toLocaleUpperCase()}${repaired.slice(1)}`
        : `${repaired[0].toLocaleLowerCase()}${repaired.slice(1)}`;
    });
  }
  return next as T;
}

export function hasBrokenVisibleText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return MOJIBAKE_HINT.test(value) || /[A-Za-zÀ-ſ]\?[A-Za-zÀ-ſ]/u.test(value);
}
