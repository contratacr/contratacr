export function humanizeMessageKey(key: string): string {
  const leaf = key.split(".").pop() || key;
  const readable = leaf
    .replace(/[_-]+/g, " ")
    .replace(/([a-záéíóúñ])([A-Z])/g, "$1 $2")
    .trim();

  return readable.replace(/^./u, (character) => character.toUpperCase());
}
