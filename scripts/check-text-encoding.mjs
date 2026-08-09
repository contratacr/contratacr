import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOTS = ["messages", "src", "scripts"];
const TEXT_EXTENSIONS = new Set([".css", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx"]);
const INTENTIONAL_REPAIR_FILE = path.normalize("src/lib/text/repair-visible-text.ts");
const INTENTIONAL_TEXT_FILES = new Set([
  INTENTIONAL_REPAIR_FILE,
  path.normalize("scripts/check-text-encoding.mjs"),
  path.normalize("scripts/repair-text-encoding.mjs"),
  path.normalize("scripts/seed-mobile-demo.js"),
]);
const MOJIBAKE = /(?:\u00c3[\u0080-\u017f]|\u00c2[\u0080-\u017f]|\u00e2[\u0080-\u017f]|\ufffd)/u;
const BROKEN_SPANISH_WORD = /(?:\b(?:identificaci|informaci|ubicaci|verificaci|descripci|secci|opci|rese|contrase|canci|atenci|profesi|categor|plomer|jardiner|fotograf|tecnolog|mec|formaci|educaci|configuraci|conexi|instalaci|publicaci|conversaci|el)\?[A-Za-z\u00c0-\u017f]+|\b(?:a\?os?|casos de \?xito|b\?squeda|b\?sicos?|m\?s|est\?|c\?dula|pa\?s|d\?a|qu\?|c\?mo|cu\?ndo|qui\?n|despu\?s|tambi\?n)\b)/iu;
const INVALID_CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const VISIBLE_UNICODE_ESCAPE = /\\u00[0-9a-fA-F]{2}/u;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const BROKEN_INLINE_CHARACTER = /[A-Za-z\u00c0-\u017f][?][A-Za-z\u00c0-\u017f]/u;
const BROKEN_COMMON_WORD_ENDING = /\b(?:qu|est|m|mant|t|p|gu|c|d|pa)\?(?=\s|[,.!;:]|$)/iu;
const MESSAGE_CATALOGS = {
  es: JSON.parse(fs.readFileSync(path.join("messages", "es.json"), "utf8")),
  en: JSON.parse(fs.readFileSync(path.join("messages", "en.json"), "utf8")),
};
// Template-based calls such as t(`messages.${action}`) cannot be resolved by
// the AST literal-key scan below. Keep their finite runtime contracts here so
// deleting a key from every locale still fails text:check before the app runs.
const REQUIRED_DYNAMIC_MESSAGE_PATHS = [
  ...["request", "whatsapp", "call", "email", "proposal", "favorite", "follow"]
    .map((key) => `selfAction.messages.${key}`),
  ...["proposals", "sent_bookings", "sent_projects", "saved", "connections", "network"]
    .map((key) => `proPanel.subtitles.${key}`),
];

function messageValue(catalog, fullPath) {
  return fullPath.split(".").reduce((current, segment) => (
    current && typeof current === "object" ? current[segment] : undefined
  ), catalog);
}

function collectMessagePaths(value, prefix = "", paths = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      collectMessagePaths(child, fullPath, paths);
    } else {
      paths.add(fullPath);
    }
  }
  return paths;
}

function isNavigationValue(value) {
  const trimmed = value.trim();
  return /^(?:https?:|mailto:|tel:|\/|#)/iu.test(trimmed)
    || /[?&][A-Za-z][\w-]*=/u.test(trimmed);
}

function checkVisibleValue(value, file, line, failures) {
  if ((!BROKEN_INLINE_CHARACTER.test(value) && !BROKEN_COMMON_WORD_ENDING.test(value)) || isNavigationValue(value)) return;
  failures.push(`${file}:${line}: ${value.trim()}`);
}

function inspectJsonValue(value, file, failures, line = 1) {
  if (typeof value === "string") {
    checkVisibleValue(value, file, line, failures);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => inspectJsonValue(item, file, failures, line));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => inspectJsonValue(item, file, failures, line));
  }
}

function inspectSourceText(source, file, failures) {
  const scriptKind = file.endsWith(".tsx") || file.endsWith(".jsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".ts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const translators = new Map();

  function unwrapExpression(node) {
    let current = node;
    while (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current)) {
      current = current.expression;
    }
    return current;
  }

  function stringValue(node) {
    const expression = unwrapExpression(node);
    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
    return null;
  }

  function checkMessageKey(namespace, key, line) {
    const fullPath = namespace ? `${namespace}.${key}` : key;
    const missingLocales = Object.entries(MESSAGE_CATALOGS)
      .filter(([, catalog]) => messageValue(catalog, fullPath) === undefined)
      .map(([locale]) => locale);
    if (missingLocales.length > 0) {
      failures.push(`${file}:${line}: Falta mensaje i18n "${fullPath}" en ${missingLocales.join(", ")}.`);
    }
  }

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && node.initializer.expression.text === "useTranslations"
    ) {
      const namespace = node.initializer.arguments[0] ? stringValue(node.initializer.arguments[0]) : "";
      if (namespace !== null) translators.set(node.name.text, namespace);
    }

    if (ts.isCallExpression(node)) {
      let translatorName = null;
      if (ts.isIdentifier(node.expression)) {
        translatorName = node.expression.text;
      } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
        translatorName = node.expression.expression.text;
      }
      if (translatorName && translators.has(translatorName) && node.arguments[0]) {
        const key = stringValue(node.arguments[0]);
        if (key) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.arguments[0].getStart(sourceFile));
          checkMessageKey(translators.get(translatorName), key, start.line + 1);
        }
      }
    }

    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      checkVisibleValue(node.text, file, start.line + 1, failures);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function collectFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(target, files);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
  return files;
}

const failures = [];
const catalogPaths = Object.fromEntries(
  Object.entries(MESSAGE_CATALOGS).map(([locale, catalog]) => [locale, collectMessagePaths(catalog)]),
);
const allCatalogPaths = new Set(Object.values(catalogPaths).flatMap((paths) => [...paths]));
for (const fullPath of allCatalogPaths) {
  const missingLocales = Object.entries(catalogPaths)
    .filter(([, paths]) => !paths.has(fullPath))
    .map(([locale]) => locale);
  if (missingLocales.length > 0) {
    failures.push(`messages:1: La clave i18n "${fullPath}" falta en ${missingLocales.join(", ")}.`);
  }
}
for (const fullPath of REQUIRED_DYNAMIC_MESSAGE_PATHS) {
  const missingLocales = Object.entries(MESSAGE_CATALOGS)
    .filter(([, catalog]) => messageValue(catalog, fullPath) === undefined)
    .map(([locale]) => locale);
  if (missingLocales.length > 0) {
    failures.push(`messages:1: Falta mensaje i18n dinámico "${fullPath}" en ${missingLocales.join(", ")}.`);
  }
}
for (const root of ROOTS) {
  for (const file of collectFiles(root)) {
    const normalizedFile = path.normalize(file);
    const bytes = fs.readFileSync(file);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      failures.push(`${file}:1: El archivo contiene BOM UTF-8.`);
    }

    let source;
    try {
      source = UTF8_DECODER.decode(bytes);
    } catch {
      failures.push(`${file}:1: El archivo no contiene UTF-8 valido.`);
      continue;
    }

    const lines = source.split(/\r?\n/u);
    const allowsEncodingPatterns = INTENTIONAL_TEXT_FILES.has(normalizedFile);
    lines.forEach((line, index) => {
      const containsBrokenVisibleText = !allowsEncodingPatterns
        && (MOJIBAKE.test(line) || BROKEN_SPANISH_WORD.test(line));
      const containsVisibleUnicodeEscape = !allowsEncodingPatterns && VISIBLE_UNICODE_ESCAPE.test(line);
      if (containsBrokenVisibleText || INVALID_CONTROL_CHARACTER.test(line) || containsVisibleUnicodeEscape) {
        failures.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
    if (!INTENTIONAL_TEXT_FILES.has(normalizedFile)) {
      const extension = path.extname(file);
      if (extension === ".json") {
        try {
          inspectJsonValue(JSON.parse(source), file, failures);
        } catch {
          // Syntax validation belongs to the JSON/build tooling.
        }
      } else if ([".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(extension)) {
        inspectSourceText(source, file, failures);
      } else if (extension === ".md") {
        lines.forEach((line, index) => checkVisibleValue(line, file, index + 1, failures));
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Se detectaron textos con codificacion danada:\n");
  console.error(failures.join("\n"));
  console.error("\nGuarda los archivos como UTF-8 y escribe las tildes reales antes de compilar.");
  process.exit(1);
}

console.log("Textos UTF-8 verificados.");
