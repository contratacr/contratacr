import { trozos } from "./texto-rico";

/**
 * EL EDITOR CON FORMATO DEL CV (19-nov-2026): lo que se ve es lo que sale.
 * Por dentro el texto sigue guardado igual que siempre
 *   **negrita**   ·   - viñeta   ·   [texto](https://…)
 * y estas dos funciones van y vienen entre ese texto y lo que muestra el
 * editor (un div editable). Así la vista previa, el PDF y el texto para pegar
 * no cambian.
 */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const VINETA = /^\s*[•\-–]\s+/;

/** Texto guardado → HTML del editor. Solo etiquetas propias; todo lo demás va escapado. */
export function htmlDeTexto(texto: string, vinetas: boolean): string {
  let html = "", lista = false;
  for (const linea of texto.split("\n")) {
    const esVineta = vinetas && VINETA.test(linea);
    const contenido = esVineta ? linea.replace(VINETA, "") : linea;
    const enLinea = trozos(contenido).map((t) => {
      const x = t.negrita ? `<b>${esc(t.texto)}</b>` : esc(t.texto);
      return t.url ? `<a href="${esc(t.url)}">${x}</a>` : x;
    }).join("") || "<br>";
    if (esVineta) {
      if (!lista) { html += "<ul>"; lista = true; }
      html += `<li>${enLinea}</li>`;
    } else {
      if (lista) { html += "</ul>"; lista = false; }
      html += `<div>${enLinea}</div>`;
    }
  }
  if (lista) html += "</ul>";
  return html;
}

/**
 * HTML del editor → texto guardado. Entiende lo que arman Chrome y Safari al
 * escribir (div por línea, <br> en las líneas vacías, <b>, <ul><li>, <a>) y
 * descarta cualquier otra etiqueta. Autocontenida (sin nada de afuera) para
 * poder probarla dentro del navegador.
 */
export function textoDeHtml(raiz: Element): string {
  const lineas: string[] = [];
  let actual = "";
  let hayActual = false;
  const cortar = () => { lineas.push(actual); actual = ""; hayActual = false; };
  const esBloque = (el: Element) => /^(DIV|P|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test(el.tagName);
  const esLista = (el: Element) => el.tagName === "UL" || el.tagName === "OL";
  const esNegrita = (el: Element) => /^(B|STRONG)$/.test(el.tagName) || /^(bold|bolder|[6-9]00)$/.test((el as HTMLElement).style?.fontWeight ?? "");
  const enLinea = (n: Node): string => {
    if (n.nodeType === 3) return (n.textContent ?? "").replace(/ /g, " ").replace(/\n/g, " ");
    if (n.nodeType !== 1) return "";
    const el = n as Element;
    if (el.tagName === "BR") return "\n";
    if (/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName)) return "";
    const dentro = Array.from(el.childNodes).map(enLinea).join("");
    if (el.tagName === "A") {
      const href = (el.getAttribute("href") ?? "").trim();
      if (!/^https?:\/\/\S+$/i.test(href)) return dentro;
      const visible = dentro.replace(/\*\*/g, "");
      if (!visible.trim() || visible.trim() === href) return href;
      return `[${visible.replace(/[[\]\n]/g, " ")}](${href})`;
    }
    if (esNegrita(el)) {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(dentro);
      if (!m || !m[2] || m[2].includes("\n")) return dentro;
      return `${m[1]}**${m[2].replace(/\*\*/g, "")}**${m[3]}`;
    }
    return dentro;
  };
  const bloque = (el: Element, prefijo: string) => {
    if (Array.from(el.children).some((c) => esBloque(c) || esLista(c))) {
      Array.from(el.childNodes).forEach((c) => visitar(c, prefijo));
      if (hayActual) cortar();
      return;
    }
    // El <br> del final de un bloque es solo el relleno de una línea vacía.
    const texto = Array.from(el.childNodes).map(enLinea).join("").replace(/\n$/, "");
    for (const p of texto.split("\n")) lineas.push(prefijo && p.trim() ? prefijo + p.trimStart() : p);
  };
  const visitar = (n: Node, prefijo: string) => {
    if (n.nodeType === 1) {
      const el = n as Element;
      if (esLista(el)) {
        if (hayActual) cortar();
        Array.from(el.children).forEach((li) => bloque(li, "- "));
        return;
      }
      if (esBloque(el)) { if (hayActual) cortar(); bloque(el, prefijo); return; }
      if (el.tagName === "BR") { cortar(); return; }
    }
    actual += enLinea(n);
    hayActual = true;
  };
  Array.from(raiz.childNodes).forEach((c) => visitar(c, ""));
  if (hayActual) cortar();
  return lineas.map((l) => l.replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "");
}
