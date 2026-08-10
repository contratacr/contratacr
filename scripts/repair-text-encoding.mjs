import fs from "node:fs";
import path from "node:path";

const ROOTS = ["messages", "src", "scripts"];
const EXTENSIONS = new Set([".css", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const CP1252_EXTRA = new Map([
  ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85], ["†", 0x86],
  ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a], ["‹", 0x8b], ["Œ", 0x8c],
  ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92], ["“", 0x93], ["”", 0x94], ["•", 0x95],
  ["–", 0x96], ["—", 0x97], ["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b],
  ["œ", 0x9c], ["ž", 0x9e], ["Ÿ", 0x9f],
]);
const SUSPICIOUS = /(?:Ã[\u0080-\u017f]|Â[\u0080-\u017f]|â[\u0080-\u017f]|ï¿½|�)/gu;

function score(value) {
  return [...value.matchAll(SUSPICIOUS)].length;
}

function cp1252Byte(character) {
  const code = character.codePointAt(0);
  if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) return code;
  return CP1252_EXTRA.get(character);
}

function decodeCandidate(value) {
  const bytes = [];
  for (const character of value) {
    const byte = cp1252Byte(character);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  try {
    return UTF8.decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function repairRun(value) {
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const decoded = decodeCandidate(current);
    if (!decoded || score(decoded) >= score(current)) break;
    current = decoded;
  }
  return current;
}

function repairText(source) {
  let output = "";
  let run = "";
  const flush = () => {
    output += score(run) ? repairRun(run) : run;
    run = "";
  };

  for (const character of source) {
    if (character === "\n" || character === "\r") {
      flush();
      output += character;
    } else if (cp1252Byte(character) !== undefined) run += character;
    else {
      flush();
      output += character;
    }
  }
  flush();
  return output;
}

function filesIn(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) filesIn(target, result);
    else if (EXTENSIONS.has(path.extname(entry.name))) result.push(target);
  }
  return result;
}

let changed = 0;
const write = process.argv.includes("--write");
for (const root of ROOTS) {
  for (const file of filesIn(root)) {
    const rawSource = fs.readFileSync(file, "utf8");
    const hadBom = rawSource.startsWith("\uFEFF");
    const source = rawSource.replace(/^\uFEFF/u, "");
    const repaired = repairText(source);
    if (repaired === source && !hadBom) continue;
    if (write) fs.writeFileSync(file, repaired, "utf8");
    changed += 1;
    console.log(`${file}: ${score(source)} -> ${score(repaired)}${hadBom ? " (BOM eliminado)" : ""}`);
    if (!write && score(repaired) > 0) {
      repaired.split(/\r?\n/u)
        .filter((line) => score(line) > 0)
        .slice(0, 20)
        .forEach((line) => console.log(`  ${line.trim()}`));
    }
  }
}

console.log(`${write ? "Reparados" : "Se repararían"} ${changed} archivos.`);
