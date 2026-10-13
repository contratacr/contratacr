import QRCode from "qrcode";
import fs from "node:fs";

const destination = "https://contratacr.com/descargar";
const matrix = QRCode.create(destination, { errorCorrectionLevel: "H" }).modules;
const modules = matrix.size + 8;
// Filled runs avoid fractional-width SVG strokes that Safari rasterizes
// inconsistently at small sizes; the QR module geometry stays exact.
let cells = "";
for (let row = 0; row < matrix.size; row++) {
  for (let col = 0; col < matrix.size;) {
    if (!matrix.get(row, col)) { col++; continue; }
    const start = col;
    while (col < matrix.size && matrix.get(row, col)) col++;
    cells += `M${start+4} ${row+4}h${col-start}v1H${start+4}z`;
  }
}
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges"><path fill="white" d="M0 0h${modules}v${modules}H0z"/><path fill="#092532" d="${cells}"/></svg>`;
const white = 10, logo = 8;
const data = fs.readFileSync(new URL("../../public/logo-mark-transparent.png", import.meta.url)).toString("base64");
// The existing 256 px mark has empty margins. Use a nested SVG viewBox to
// frame the actual artwork (alpha bounds), without editing the PNG itself.
const badge = `<rect x="${(modules-white)/2}" y="${(modules-white)/2}" width="${white}" height="${white}" rx="1" fill="white"/><svg x="${(modules-logo)/2}" y="${(modules-logo)/2}" width="${logo}" height="${logo}" viewBox="38 40 177 174" preserveAspectRatio="xMidYMid meet"><image href="data:image/png;base64,${data}" width="256" height="256"/></svg>`;
svg = svg.replace("</svg>", `${badge}</svg>`);
fs.writeFileSync(new URL("../../public/stores/download-app-qr.svg", import.meta.url), svg);
console.log(`QR generated: ${destination}, ${modules} modules, H correction, centered 8-module logo`);
