import type { jsPDF as JsPdf } from "jspdf";
import { bloquesDelCv, encabezadoDeEntrada, partesDeLaCarta, fechasAts, lineasDeReferencia, type Bloque, type Carta, type CvDocumento } from "./documento";
import { aclarar, disenoDe, ESPACIOS, INTERLINEADOS, MARGENES, PAGINA, rgb, TAMANOS, TINTA, type Diseno, type Fuente, type Rgb } from "./diseno";
import { lineasRicas, type Trozo } from "./texto-rico";
import type { CvEntry } from "./model";

/**
 * LA MAQUETA: dónde va cada palabra, línea y caja, página por página
 * (19-nov-2026). Se arma una sola vez, midiendo el texto con las mismas letras
 * del PDF (jsPDF), y de ahí salen la vista previa (SVG) y el PDF. Así la vista
 * previa muestra los mismos saltos de página y la misma cantidad de páginas que
 * el archivo que se descarga.
 */

export type Op = { seccion?: string } & (
  | { t: "texto"; x: number; y: number; s: string; fuente: Fuente; negrita: boolean; tam: number; color: Rgb; ancho: number; url?: string }
  | { t: "linea"; x1: number; y1: number; x2: number; y2: number; color: Rgb; grosor: number }
  | { t: "caja"; x: number; y: number; w: number; h: number; color: Rgb; radio: number }
  | { t: "punto"; x: number; y: number; r: number; color: Rgb }
  // La firma dibujada a mano (PNG): 3 de ancho por 1 de alto.
  | { t: "imagen"; x: number; y: number; w: number; h: number; src: string }
);
export type Maqueta = { ancho: number; alto: number; paginas: Op[][] };

const GRIS: Rgb = [82, 98, 122];
const ENLACE: Rgb = [0, 111, 156];
const TINTA_RGB: Rgb = rgb(TINTA);

type Columna = { x: number; ancho: number; y: number; pagina: number };
type Estilo = { tam?: number; negrita?: boolean; color?: Rgb; sangria?: number; interlineado?: number; centro?: boolean };

class Maquetador {
  paginas: Op[][] = [[]];
  seccion?: string;
  readonly d: Diseno;
  readonly ancho: number;
  readonly alto: number;
  readonly margen: number;
  readonly base: number;
  readonly lh: number;
  readonly acento: Rgb;
  readonly enlace: Rgb;
  readonly linea: Rgb;
  /** Lo que se dibuja en cada página nueva antes que el texto (la franja lateral). */
  fondo: (pagina: number) => Op[] = () => [];

  constructor(readonly doc: JsPdf, d: Diseno) {
    this.d = d;
    ({ ancho: this.ancho, alto: this.alto } = PAGINA[d.formato]);
    this.margen = MARGENES[d.margen];
    this.base = TAMANOS[d.tamano];
    this.lh = INTERLINEADOS[d.interlineado];
    this.acento = rgb(d.color);
    const tinta = d.color === TINTA;
    // Con el color de siempre, enlaces y líneas quedan como antes.
    this.enlace = tinta ? ENLACE : this.acento;
    this.linea = tinta ? GRIS : this.acento;
  }

  fuente(negrita = false, tam = this.base) {
    this.doc.setFont(this.d.fuente, negrita ? "bold" : "normal");
    this.doc.setFontSize(tam);
  }
  medir(s: string, negrita = false, tam = this.base) { this.fuente(negrita, tam); return this.doc.getTextWidth(s); }
  partir(s: string, ancho: number, negrita = false, tam = this.base): string[] {
    this.fuente(negrita, tam);
    return this.doc.splitTextToSize(s, Math.max(ancho, 10)) as string[];
  }
  pagina(i: number): Op[] {
    while (this.paginas.length <= i) this.paginas.push([...this.fondo(this.paginas.length)]);
    return this.paginas[i];
  }
  poner(col: Columna, op: Op) { this.pagina(col.pagina).push(this.seccion ? { ...op, seccion: this.seccion } : op); }
  asegurar(col: Columna, alto: number) {
    if (col.y + alto <= this.alto - this.margen) return;
    col.pagina += 1;
    col.y = this.margen;
    this.pagina(col.pagina);
  }
  texto(col: Columna, s: string, x: number, y: number, e: { negrita?: boolean; tam?: number; color?: Rgb; url?: string } = {}) {
    const tam = e.tam ?? this.base;
    this.poner(col, { t: "texto", x, y, s, fuente: this.d.fuente, negrita: !!e.negrita, tam, color: e.color ?? TINTA_RGB, ancho: this.medir(s, e.negrita, tam), ...(e.url ? { url: e.url } : {}) });
  }

  parrafo(col: Columna, s: string, e: Estilo = {}) {
    const tam = e.tam ?? this.base;
    const sangria = e.sangria ?? 0;
    const alto = tam * (e.interlineado ?? this.lh);
    for (const linea of this.partir(s, col.ancho - sangria, e.negrita, tam)) {
      this.asegurar(col, alto);
      const x = e.centro ? col.x + (col.ancho - this.medir(linea, e.negrita, tam)) / 2 : col.x + sangria;
      this.texto(col, linea, x, col.y + tam, { negrita: e.negrita, tam, color: e.color });
      col.y += alto;
    }
  }

  /**
   * Un párrafo con negrita o enlaces, armado palabra por palabra con la medida
   * de cada letra. Las palabras seguidas con el mismo formato van juntas.
   */
  parrafoRico(col: Columna, partes: Trozo[], e: { tam?: number; sangria?: number; interlineado?: number } = {}) {
    if (!partes.some((t) => t.negrita || t.url)) { this.parrafo(col, partes.map((t) => t.texto).join(""), e); return; }
    const tam = e.tam ?? this.base;
    const sangria = e.sangria ?? 0;
    const alto = tam * (e.interlineado ?? this.lh);
    const ancho = col.ancho - sangria;
    type Palabra = { s: string; negrita?: boolean; url?: string; espacio: boolean; w: number };
    const palabras: Palabra[] = [];
    for (const t of partes) {
      t.texto.split(/(\s+)/).forEach((p) => {
        if (!p) return;
        if (/^\s+$/.test(p)) { if (palabras.length) palabras[palabras.length - 1].espacio = true; return; }
        palabras.push({ s: p, negrita: t.negrita, url: t.url, espacio: false, w: this.medir(p, t.negrita, tam) });
      });
    }
    const espacio = this.medir(" ", false, tam);
    let linea: Palabra[] = [];
    let usado = 0;
    const dibujar = () => {
      this.asegurar(col, alto);
      let x = col.x + sangria;
      let i = 0;
      while (i < linea.length) {
        const p = linea[i];
        let s = p.s;
        let j = i + 1;
        while (j < linea.length && !!linea[j].negrita === !!p.negrita && linea[j].url === p.url && linea[j - 1].espacio) { s += " " + linea[j].s; j += 1; }
        this.texto(col, s, x, col.y + tam, { negrita: p.negrita, tam, color: p.url ? this.enlace : TINTA_RGB, url: p.url });
        x += this.medir(s, p.negrita, tam) + (linea[j - 1].espacio ? espacio : 0);
        i = j;
      }
      col.y += alto;
      linea = []; usado = 0;
    };
    for (const p of palabras) {
      const antes = linea.length && linea[linea.length - 1].espacio ? espacio : 0;
      if (linea.length && usado + antes + p.w > ancho) dibujar();
      usado += (linea.length ? antes : 0) + p.w;
      linea.push(p);
    }
    if (linea.length) dibujar();
  }

  vineta(col: Columna, partes: Trozo[], e: { tam?: number; interlineado?: number } = {}) {
    const tam = e.tam ?? this.base;
    this.asegurar(col, tam * (e.interlineado ?? this.lh));
    this.texto(col, "•", col.x + 2, col.y + tam, { tam });
    this.parrafoRico(col, partes, { ...e, sangria: 12 });
  }
  textoRico(col: Columna, s: string, e: { tam?: number; interlineado?: number } = {}) {
    lineasRicas(s).forEach((x) => (x.vineta ? this.vineta(col, x.trozos, e) : this.parrafoRico(col, x.trozos, e)));
  }
  /** La firma a mano, 3:1, pegada a la izquierda de la columna. */
  firma(col: Columna, src: string, alto = 40) {
    this.asegurar(col, alto + 4);
    this.poner(col, { t: "imagen", x: col.x, y: col.y, w: alto * 3, h: alto, src });
    col.y += alto + 2;
  }

  titulo(col: Columna, s: string) {
    const tam = this.base + 0.5;
    const texto = s.toUpperCase();
    col.y += ESPACIOS[this.d.espacio];
    // El título nunca queda solo al pie de la página.
    this.asegurar(col, tam + 8 + this.base * this.lh * 2);
    switch (this.d.titulos) {
      case "linea":
        this.texto(col, texto, col.x, col.y + tam, { negrita: true, tam, color: this.acento });
        col.y += tam + 5;
        this.poner(col, { t: "linea", x1: col.x, y1: col.y, x2: col.x + col.ancho, y2: col.y, color: this.linea, grosor: 0.5 });
        col.y += 8;
        break;
      case "simple":
        this.texto(col, texto, col.x, col.y + tam, { negrita: true, tam, color: this.acento });
        col.y += tam + 7;
        break;
      case "caja": {
        const h = tam + 9;
        this.poner(col, { t: "caja", x: col.x, y: col.y, w: col.ancho, h, color: aclarar(this.acento, 0.86), radio: 2 });
        this.texto(col, texto, col.x + 6, col.y + h / 2 + tam * 0.35, { negrita: true, tam, color: this.acento });
        col.y += h + 7;
        break;
      }
      case "fina": {
        this.texto(col, texto, col.x, col.y + tam, { negrita: true, tam, color: this.acento });
        const desde = col.x + this.medir(texto, true, tam) + 8;
        const y = col.y + tam * 0.62;
        if (desde < col.x + col.ancho) this.poner(col, { t: "linea", x1: desde, y1: y, x2: col.x + col.ancho, y2: y, color: aclarar(this.acento, 0.55), grosor: 0.5 });
        col.y += tam + 8;
        break;
      }
      case "barra":
        this.poner(col, { t: "caja", x: col.x, y: col.y - 1, w: 3, h: tam + 4, color: this.acento, radio: 0 });
        this.texto(col, texto, col.x + 9, col.y + tam, { negrita: true, tam, color: this.acento });
        col.y += tam + 9;
        break;
    }
  }

  entrada(col: Columna, e: CvEntry, idioma: CvDocumento["idioma"]) {
    const tam = this.base;
    const tamFecha = this.base - 1;
    this.asegurar(col, tam * this.lh * 2 + 6);
    const cabeza = encabezadoDeEntrada(e);
    const fecha = e.period.trim() ? fechasAts(e.period, idioma, this.d.formatoFecha) : "";
    if (this.d.fechas === "derecha" && fecha) {
      const wf = this.medir(fecha, false, tamFecha);
      const [primera, ...resto] = this.partir(cabeza || " ", col.ancho - wf - 10, true, tam);
      const alto = tam * this.lh;
      this.texto(col, primera, col.x, col.y + tam, { negrita: true, tam });
      this.texto(col, fecha, col.x + col.ancho - wf, col.y + tam, { tam: tamFecha, color: GRIS });
      col.y += alto;
      if (resto.length) this.parrafo(col, resto.join(" "), { negrita: true, tam });
    } else {
      this.parrafo(col, cabeza, { negrita: true, tam });
      if (fecha) this.parrafo(col, fecha, { tam: tamFecha, color: GRIS });
    }
    for (const x of lineasRicas(e.description, true)) this.vineta(col, x.trozos);
  }

  etiquetas(col: Columna, items: string[]) {
    const tam = this.base - 1;
    const h = tam + 7;
    let x = col.x;
    let fila = true;
    this.asegurar(col, h + 4);
    for (const item of items) {
      const w = Math.min(this.medir(item, false, tam) + 12, col.ancho);
      if (x > col.x && x + w > col.x + col.ancho) { col.y += h + 4; x = col.x; this.asegurar(col, h + 4); }
      this.poner(col, { t: "caja", x, y: col.y, w, h, color: aclarar(this.acento, 0.86), radio: h / 2 });
      this.texto(col, item, x + 6, col.y + h / 2 + tam * 0.35, { tam });
      x += w + 4;
      fila = true;
    }
    if (fila) col.y += h + 2;
  }

  niveles(col: Columna, items: string[], niveles: Record<string, number>) {
    const alto = this.base * this.lh + 1;
    const puntos = 5;
    const r = Math.max(2, this.base * 0.22);
    const paso = r * 2 + 3;
    const anchoPuntos = paso * puntos;
    for (const item of items) {
      const nivel = Math.max(0, Math.min(5, Math.round(niveles[item] ?? 0)));
      const espacioTexto = nivel ? col.ancho - anchoPuntos - 6 : col.ancho;
      const lineas = this.partir(item, espacioTexto);
      this.asegurar(col, alto * lineas.length);
      const y0 = col.y;
      lineas.forEach((l, i) => this.texto(col, l, col.x, y0 + this.base + i * alto));
      if (nivel) {
        const yc = y0 + this.base * 0.65;
        for (let i = 0; i < puntos; i++) {
          this.poner(col, { t: "punto", x: col.x + col.ancho - anchoPuntos + i * paso + r, y: yc, r, color: i < nivel ? this.acento : aclarar(this.acento, 0.78) });
        }
      }
      col.y = y0 + alto * lineas.length;
    }
  }

  bloque(col: Columna, b: Bloque, cv: CvDocumento) {
    this.seccion = b.id;
    this.titulo(col, b.titulo);
    switch (b.tipo) {
      case "texto": this.textoRico(col, b.texto); break;
      case "entradas":
        b.entradas.forEach((e, i) => { if (i) col.y += 6; this.entrada(col, e, cv.idioma); });
        break;
      case "lineas": b.lineas.forEach((c) => this.parrafo(col, c)); break;
      case "comas":
        if ((b.id === "habilidades" || b.id === "intereses") && this.d.habilidades === "etiquetas") this.etiquetas(col, b.items);
        else if (b.id === "habilidades" && this.d.habilidades === "niveles") this.niveles(col, b.items, cv.niveles ?? {});
        else this.parrafo(col, b.items.join(", "));
        break;
      case "referencias":
        b.referencias.forEach((r, i) => {
          if (i) col.y += 6;
          const [primera, ...resto] = lineasDeReferencia(r);
          this.parrafo(col, primera, { negrita: true });
          resto.forEach((x) => this.parrafo(col, x, { tam: this.base - 1, color: GRIS }));
        });
        break;
      case "declaracion":
        this.textoRico(col, b.texto);
        col.y += 10;
        if (b.lugarFecha) this.parrafo(col, b.lugarFecha, { tam: this.base - 1, color: GRIS });
        if (b.firma) this.firma(col, b.firma, 34);
        if (cv.nombre.trim()) this.parrafo(col, cv.nombre, { negrita: true });
        break;
    }
    this.seccion = undefined;
  }

  /** Nombre, título y contacto, a todo el ancho de la primera página. */
  encabezado(cv: CvDocumento, conEnlace = true): Columna {
    const col: Columna = { x: this.margen, ancho: this.ancho - this.margen * 2, y: this.margen, pagina: 0 };
    const centro = this.d.alineacion === "centro";
    const tamNombre = this.base * 2.1;
    const tamTitular = this.base + 1.5;
    const nombre = cv.nombre || " ";
    const titular = cv.titular.trim();
    this.seccion = "encabezado";
    let enLinea = false;
    if (this.d.encabezado === "en-linea" && titular) {
      const wn = this.medir(nombre, true, tamNombre);
      const wt = this.medir(titular, false, tamTitular);
      if (wn + 14 + wt <= col.ancho) {
        enLinea = true;
        const x = centro ? col.x + (col.ancho - wn - 14 - wt) / 2 : col.x;
        const base = col.y + tamNombre;
        this.texto(col, nombre, x, base, { negrita: true, tam: tamNombre, color: this.acento });
        this.texto(col, titular, x + wn + 14, base, { tam: tamTitular, color: GRIS });
        col.y += tamNombre * 1.15 + 2;
      }
    }
    if (!enLinea) {
      this.parrafo(col, nombre, { tam: tamNombre, negrita: true, interlineado: 1.15, color: this.acento, centro });
      if (titular) this.parrafo(col, titular, { tam: tamTitular, color: GRIS, centro });
    }
    const contacto = [cv.correo, cv.telefono, cv.ubicacion, ...(conEnlace ? [cv.enlace] : [])].filter((v) => v.trim()).join("  |  ");
    if (contacto) { col.y += 2; this.parrafo(col, contacto, { tam: this.base - 1, color: GRIS, centro }); }
    this.seccion = undefined;
    return col;
  }
}

function maquetarCv(doc: JsPdf, cv: CvDocumento): Maqueta {
  const d = disenoDe(cv);
  const m = new Maquetador(doc, d);
  const cabeza = m.encabezado(cv);
  const bloques = bloquesDelCv(cv);
  const lateral = new Set(d.lateral);
  const enLateral = d.columnas === "una" ? [] : bloques.filter((b) => b.id !== "libres" && lateral.has(b.id));
  if (!enLateral.length) {
    bloques.forEach((b) => m.bloque(cabeza, b, cv));
    return { ancho: m.ancho, alto: m.alto, paginas: m.paginas };
  }
  // ── DOS COLUMNAS ── cada una sigue de página en página por su cuenta.
  const total = m.ancho - m.margen * 2;
  const separacion = 20;
  const angosta = Math.round(total * 0.32);
  const izquierda = d.columnas === "izquierda";
  const inicio = cabeza.y + 4;
  const xAngosta = izquierda ? m.margen : m.margen + total - angosta;
  const xAncha = izquierda ? m.margen + angosta + separacion : m.margen;
  const franjaX = izquierda ? 0 : xAngosta - separacion / 2;
  const franjaW = izquierda ? m.margen + angosta + separacion / 2 : m.ancho - franjaX;
  const franja = (y: number): Op => ({ t: "caja", x: franjaX, y, w: franjaW, h: m.alto - y, color: aclarar(m.acento, 0.93), radio: 0 });
  m.paginas[0].unshift(franja(inicio));
  m.fondo = () => [franja(0)];
  const ancha: Columna = { x: xAncha, ancho: total - angosta - separacion, y: inicio, pagina: 0 };
  const estrecha: Columna = { x: xAngosta + (izquierda ? 0 : 0), ancho: angosta, y: inicio, pagina: 0 };
  bloques.filter((b) => !enLateral.includes(b)).forEach((b) => m.bloque(ancha, b, cv));
  enLateral.forEach((b) => m.bloque(estrecha, b, cv));
  return { ancho: m.ancho, alto: m.alto, paginas: m.paginas };
}

function maquetarCarta(doc: JsPdf, cv: CvDocumento, carta: Carta): Maqueta {
  const d = disenoDe(cv);
  const m = new Maquetador(doc, { ...d, columnas: "una" });
  const col = m.encabezado(cv, false);
  col.y += 18;
  const e = { tam: m.base + 0.5, interlineado: m.lh + 0.1 };
  const hueco = () => { col.y += 8; };
  // Lo mismo que el texto copiado (cuerpoDeLaCarta), pero con formato y firma.
  const p = partesDeLaCarta(cv, carta);
  m.parrafo(col, p.fecha, e); hueco();
  if (p.destinatario.length) { p.destinatario.forEach((l) => m.parrafo(col, l, e)); hueco(); }
  if (p.asunto) { m.parrafo(col, p.asunto, { ...e, negrita: true }); hueco(); }
  m.parrafo(col, p.saludo, e); hueco();
  p.parrafos.forEach((x) => { m.textoRico(col, x, e); hueco(); });
  m.parrafo(col, p.despedida, e);
  if (p.firma) { col.y += 4; m.firma(col, p.firma); }
  if (p.nombre.trim()) m.parrafo(col, p.nombre, e);
  return { ancho: m.ancho, alto: m.alto, paginas: m.paginas };
}

export async function nuevoDocumento(cv: CvDocumento): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "pt", format: disenoDe(cv).formato === "a4" ? "a4" : "letter" });
}

/** La maqueta del CV o de la carta. `doc` sirve para medir (y luego dibujar el PDF). */
export function maquetar(doc: JsPdf, cv: CvDocumento, carta?: Carta): Maqueta {
  return carta ? maquetarCarta(doc, cv, carta) : maquetarCv(doc, cv);
}
