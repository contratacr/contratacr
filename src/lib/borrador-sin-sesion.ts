"use client";

/**
 * LLENAR PRIMERO, CUENTA AL FINAL (4-oct-2026, decisión de Isaac).
 * Quien no tiene sesión puede llenar un proyecto, un empleo, una promoción o
 * una cotización completos; al tocar «Publicar» se guarda aquí y se le pide entrar o
 * registrarse. Al volver, el formulario se abre lleno y solo falta confirmar:
 * nunca se publica a ciegas.
 *
 * El texto va en localStorage (sobrevive al ida y vuelta de Google, Apple y
 * el código por correo, que pueden abrir otra pestaña) y las fotos en
 * IndexedDB (no caben en localStorage). Vence a las 48 horas.
 */
export type TipoDeBorrador = "proyecto" | "empleo" | "promocion" | "cotizacion";

const VIGENCIA_MS = 48 * 60 * 60 * 1000;
const clave = (tipo: TipoDeBorrador) => `ccr:borrador:${tipo}`;
const BASE = "ccr-borradores";

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore("archivos");
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

// Se guardan los BYTES de cada foto, no el File: Safari (sobre todo en modo
// privado) rechaza guardar Blob/File en IndexedDB y la foto de la promoción se
// perdía al registrarse. Un ArrayBuffer sí lo acepta.
type FotoGuardada = { name: string; type: string; datos: ArrayBuffer };

async function guardarArchivos(tipo: TipoDeBorrador, archivos: File[]) {
  const fotos: FotoGuardada[] = await Promise.all(archivos.map(async (f) => ({ name: f.name, type: f.type, datos: await f.arrayBuffer() })));
  const db = await abrirBase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("archivos", "readwrite");
    tx.objectStore("archivos").put(fotos, tipo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function leerArchivos(tipo: TipoDeBorrador): Promise<File[]> {
  const db = await abrirBase();
  const fotos = await new Promise<FotoGuardada[]>((resolve) => {
    const pedido = db.transaction("archivos").objectStore("archivos").get(tipo);
    pedido.onsuccess = () => resolve(Array.isArray(pedido.result) ? pedido.result : []);
    pedido.onerror = () => resolve([]);
  });
  db.close();
  return fotos.map((f) => (f instanceof File ? f : new File([f.datos], f.name, { type: f.type })));
}

// Respaldo si IndexedDB no está disponible: las fotos como texto en
// sessionStorage (sobrevive al ir y volver del inicio de sesión en la misma
// pestaña). Solo si caben; si no, se vuelven a elegir.
const claveFotos = (tipo: TipoDeBorrador) => `ccr:borrador-fotos:${tipo}`;
async function guardarFotosComoTexto(tipo: TipoDeBorrador, archivos: File[]) {
  const comoTexto = await Promise.all(archivos.map((f) => new Promise<{ name: string; url: string }>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve({ name: f.name, url: String(lector.result) });
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(f);
  })));
  window.sessionStorage.setItem(claveFotos(tipo), JSON.stringify(comoTexto));
}
async function leerFotosComoTexto(tipo: TipoDeBorrador): Promise<File[]> {
  const crudo = window.sessionStorage.getItem(claveFotos(tipo));
  if (!crudo) return [];
  const fotos = JSON.parse(crudo) as { name: string; url: string }[];
  return Promise.all(fotos.map(async (f) => {
    const blob = await (await fetch(f.url)).blob();
    return new File([blob], f.name, { type: blob.type });
  }));
}

export async function guardarBorrador<T>(tipo: TipoDeBorrador, datos: T, archivos: File[] = []) {
  try {
    window.localStorage.setItem(clave(tipo), JSON.stringify({ datos, ts: Date.now() }));
  } catch { /* sin almacenamiento: al volver tendrá que llenarlo otra vez */ }
  if (archivos.length > 0) {
    try {
      await guardarArchivos(tipo, archivos);
    } catch {
      try { await guardarFotosComoTexto(tipo, archivos); } catch { /* las fotos se vuelven a elegir */ }
    }
  }
}

export async function leerBorrador<T>(tipo: TipoDeBorrador): Promise<{ datos: T; archivos: File[] } | null> {
  try {
    const crudo = window.localStorage.getItem(clave(tipo));
    if (!crudo) return null;
    const { datos, ts } = JSON.parse(crudo) as { datos: T; ts: number };
    if (!ts || Date.now() - ts > VIGENCIA_MS) { borrarBorrador(tipo); return null; }
    let archivos: File[] = [];
    try { archivos = await leerArchivos(tipo); } catch { /* sin fotos */ }
    if (archivos.length === 0) {
      try { archivos = await leerFotosComoTexto(tipo); } catch { /* sin fotos */ }
    }
    return { datos, archivos };
  } catch {
    return null;
  }
}

export function borrarBorrador(tipo: TipoDeBorrador) {
  try { window.localStorage.removeItem(clave(tipo)); } catch { /* nada */ }
  try { window.sessionStorage.removeItem(claveFotos(tipo)); } catch { /* nada */ }
  void abrirBase().then((db) => {
    const tx = db.transaction("archivos", "readwrite");
    tx.objectStore("archivos").delete(tipo);
    tx.oncomplete = () => db.close();
  }).catch(() => {});
}

/** A dónde mandar a quien no tiene sesión, volviendo a `destino` con el borrador. */
export function rutaParaEntrar(prefijo: string, destino: string) {
  const conBorrador = `${destino}${destino.includes("?") ? "&" : "?"}borrador=1`;
  return `${prefijo}/login?redirect=${encodeURIComponent(conBorrador)}`;
}
