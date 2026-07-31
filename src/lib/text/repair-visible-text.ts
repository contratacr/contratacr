const REPAIRS: Array<[RegExp, string]> = [
  [/\bJardiner\?a\b/gi, "Jardiner\u00eda"],
  [/\bPlomer\?a\b/gi, "Plomer\u00eda"],
  [/\bCategor\?a\b/gi, "Categor\u00eda"],
  [/\bRevisi\?n\b/gi, "Revisi\u00f3n"],
  [/\bCl\?nica\b/gi, "Cl\u00ednica"],
  [/\bp\?gina\b/gi, "p\u00e1gina"],
  [/\bdise\?o\b/gi, "dise\u00f1o"],
  [/\brese\?a\b/gi, "rese\u00f1a"],
  [/\bsecci\?n\b/gi, "secci\u00f3n"],
  [/\binformaci\?n\b/gi, "informaci\u00f3n"],
  [/\bubicaci\?n\b/gi, "ubicaci\u00f3n"],
  [/\bverificaci\?n\b/gi, "verificaci\u00f3n"],
  [/\bconversaci\?n\b/gi, "conversaci\u00f3n"],
  [/\bdescripci\?n\b/gi, "descripci\u00f3n"],
  [/\bpublicaci\?n\b/gi, "publicaci\u00f3n"],
  [/\bopci\?n\b/gi, "opci\u00f3n"],
  [/\br\?pida\b/gi, "r\u00e1pida"],
  [/\br\?pido\b/gi, "r\u00e1pido"],
  [/\bdespu\?s\b/gi, "despu\u00e9s"],
  [/\btambi\?n\b/gi, "tambi\u00e9n"],
  [/\bqui\?n\b/gi, "qui\u00e9n"],
  [/\bqu\?\b/gi, "qu\u00e9"],
  [/\bcu\?ndo\b/gi, "cu\u00e1ndo"],
  [/\bc\?mo\b/gi, "c\u00f3mo"],
  [/\bT\?cnico\b/g, "T\u00e9cnico"],
  [/\bt\?cnico\b/g, "t\u00e9cnico"],
  [/\bel\?ctrica\b/gi, "el\u00e9ctrica"],
  [/\bel\?ctrico\b/gi, "el\u00e9ctrico"],
  [new RegExp("\u00c3\u00a1", "g"), "\u00e1"],
  [new RegExp("\u00c3\u00a9", "g"), "\u00e9"],
  [new RegExp("\u00c3\u00ad", "g"), "\u00ed"],
  [new RegExp("\u00c3\u00b3", "g"), "\u00f3"],
  [new RegExp("\u00c3\u00ba", "g"), "\u00fa"],
  [new RegExp("\u00c3\u00b1", "g"), "\u00f1"],
  [new RegExp("\u00c3\u0081", "g"), "\u00c1"],
  [new RegExp("\u00c3\u0089", "g"), "\u00c9"],
  [new RegExp("\u00c3\u008d", "g"), "\u00cd"],
  [new RegExp("\u00c3\u0093", "g"), "\u00d3"],
  [new RegExp("\u00c3\u009a", "g"), "\u00da"],
  [new RegExp("\u00c3\u0091", "g"), "\u00d1"],
  [new RegExp("\u00c2\u00b7", "g"), "\u00b7"],
  [new RegExp("\u00c2\u00bf", "g"), "\u00bf"],
  [new RegExp("\u00c2\u00a1", "g"), "\u00a1"],
];

export function repairVisibleText<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  let next: string = value;
  for (const [pattern, replacement] of REPAIRS) {
    next = next.replace(pattern, replacement);
  }
  return next as T;
}
