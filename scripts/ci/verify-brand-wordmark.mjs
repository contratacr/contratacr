import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// This contract checks the failure mode, not a particular font implementation:
// both contrast variants must remain self-contained outlines, never live text.
const variants = ["light", "dark"].map((tone) => {
  const svg = readFileSync(new URL(`../../public/brand/wordmark-${tone}.svg`, import.meta.url), "utf8");
  assert.match(svg, /<svg\b/, `${tone}: missing SVG`);
  assert.doesNotMatch(svg, /<(?:text|tspan|foreignObject|image|use|script|style)\b|@font-face|font-family|(?:href|src)\s*=/i, `${tone}: wordmark must not depend on fonts or external content`);
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2, `${tone}: expected the two outlined brand-color groups`);
  assert.ok(paths.every((path) => path.length > 100), `${tone}: missing glyph outlines`);
  return { paths, viewBox: svg.match(/viewBox="([^"]+)"/)?.[1] };
});
assert.deepEqual(variants[0], variants[1], "Contrast variants must have identical lettering and proportions");
console.log("Brand wordmark contract passed: identical outlines, no font dependency.");
