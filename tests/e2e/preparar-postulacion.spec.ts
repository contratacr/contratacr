import { expect, test } from "playwright/test";
import { alLlegarDesdeUnEmpleo, leerVacanteGuardada, MAX_TEXTO_VACANTE, textoDeLaVacante } from "../../src/lib/cv/vacante-empleo";
import { MAX_OFERTA } from "../../src/lib/cv/ia";

/**
 * «PREPARE SU POSTULACIÓN A ESTE EMPLEO» (20-nov-2026).
 * Lo que viaja del empleo al editor: el anuncio en texto plano y un destino.
 * Son pruebas de contrato (sin servidor): la parte que no depende del navegador.
 */
const empleo = {
  title: "Vendedor y Gestor Comercial",
  employer_name: "Soluciones Administrativas Rivera",
  description: "Buscamos una persona que atienda clientes industriales y dé seguimiento a sus pedidos.",
  responsibilities: ["Seguimiento de pedidos", "  ", "Gestión administrativa"],
  requirements: ["Manejo intermedio de Excel", "Experiencia en manufactura"],
};

test("el anuncio viaja como texto plano con puesto, empresa, responsabilidades y requisitos", () => {
  const texto = textoDeLaVacante(empleo, false);
  expect(texto.startsWith("Vendedor y Gestor Comercial\n\nSoluciones Administrativas Rivera\n\nBuscamos")).toBe(true);
  expect(texto).toContain("Responsabilidades:\n- Seguimiento de pedidos\n- Gestión administrativa");
  expect(texto).toContain("Requisitos:\n- Manejo intermedio de Excel\n- Experiencia en manufactura");
  // Las líneas vacías no salen y no hay marcas raras.
  expect(texto).not.toMatch(/-\s*\n/);
  expect(textoDeLaVacante(empleo, true)).toContain("Requirements:\n- Manejo intermedio de Excel");
});

test("un empleo sin listas ni empresa no deja títulos vacíos", () => {
  const texto = textoDeLaVacante({ title: "Cajera", description: "Atención en caja." }, false);
  expect(texto).toBe("Cajera\n\nAtención en caja.");
  expect(textoDeLaVacante({}, false)).toBe("");
});

test("el anuncio no pasa del tope de «Adaptar a una oferta»", () => {
  expect(MAX_TEXTO_VACANTE).toBe(MAX_OFERTA);
  const largo = textoDeLaVacante({ title: "X", description: "a".repeat(MAX_TEXTO_VACANTE * 2) }, false);
  expect(largo.length).toBe(MAX_TEXTO_VACANTE);
});

test("lo guardado se lee sin confiar en su forma, y el aviso viejo (solo puesto y empresa) sigue valiendo", () => {
  expect(leerVacanteGuardada(null)).toBeNull();
  expect(leerVacanteGuardada("x")).toBeNull();
  expect(leerVacanteGuardada({ puesto: "Cajera", empresa: "Súper Sol" })).toEqual({ puesto: "Cajera", empresa: "Súper Sol", texto: undefined, destino: undefined });
  const v = leerVacanteGuardada({ puesto: 5, empresa: { x: 1 }, texto: "t".repeat(MAX_TEXTO_VACANTE + 50), destino: "otro" });
  expect(v?.puesto).toBeUndefined();
  expect(v?.empresa).toBeUndefined();
  expect(v?.texto?.length).toBe(MAX_TEXTO_VACANTE);
  expect(v?.destino).toBeUndefined();
  expect(leerVacanteGuardada({ destino: "cv" })?.destino).toBe("cv");
  expect(leerVacanteGuardada({ destino: "carta" })?.destino).toBe("carta");
});

test("cada botón del empleo lleva a lo suyo y nunca pisa un documento", () => {
  const cvs = [{ id: "viejo", actualizado: 1 }, { id: "reciente", actualizado: 9 }, { id: "medio", actualizado: 5 }];
  const cv = { puesto: "Cajera", empresa: "Súper Sol", texto: "anuncio", destino: "cv" as const };
  const carta = { ...cv, destino: "carta" as const };
  // Currículum: abre el más reciente con el anuncio; sin currículums crea uno.
  expect(alLlegarDesdeUnEmpleo("cv", cv, cvs)).toEqual({ accion: "cv-existente", id: "reciente" });
  expect(alLlegarDesdeUnEmpleo("cv", cv, [])).toEqual({ accion: "cv-nuevo" });
  // Carta: siempre una carta NUEVA.
  expect(alLlegarDesdeUnEmpleo("carta", carta, cvs)).toEqual({ accion: "carta-nueva" });
  // Un aviso viejo (solo puesto y empresa, sin destino) sirve a la carta, no al currículum.
  const viejo = { puesto: "Cajera", empresa: "Súper Sol" };
  expect(alLlegarDesdeUnEmpleo("carta", viejo, cvs)).toEqual({ accion: "carta-nueva" });
  expect(alLlegarDesdeUnEmpleo("cv", viejo, cvs)).toBeNull();
  // Un destino de la otra pantalla se ignora; sin aviso o vacío no pasa nada.
  expect(alLlegarDesdeUnEmpleo("carta", cv, cvs)).toBeNull();
  expect(alLlegarDesdeUnEmpleo("cv", carta, cvs)).toBeNull();
  expect(alLlegarDesdeUnEmpleo("cv", null, cvs)).toBeNull();
  expect(alLlegarDesdeUnEmpleo("carta", { destino: "carta" }, cvs)).toBeNull();
});
