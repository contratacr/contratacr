import { expect, test } from "playwright/test";
import {
  cartaComoTexto, cartaInicial, cvComoTexto, fechasAts, nombreDeArchivo, palabrasClave, prellenar, revisarCarta, revisarCv,
} from "../../src/lib/cv/documento";
import { pdfDelCv, pdfDeLaCarta } from "../../src/lib/cv/pdf-documento";

// El generador de CV del panel: se prellena con el perfil, señala lo que suele
// hacer que un CV se descarte y saca un PDF con texto de verdad, en una columna.
const perfil = {
  nombre: "Ana Mora",
  correo: "ana@example.com",
  telefono: "8888-5555",
  ubicacion: "Atenas, Alajuela, Costa Rica",
  bio: "Electricista residencial con 8 años de experiencia en instalaciones y reparaciones para hogares y comercios pequeños.",
  servicios: ["Electricidad", "Cámaras de seguridad"],
  cv: {
    experience: [
      { title: "Técnica", organization: "Eléctrica Sur", period: "02/2015 – 12/2018", description: "" },
      { title: "Electricista", organization: "Por cuenta propia", period: "01/2019 – Present", description: "Instalé el sistema eléctrico de 40 casas\nReduje 20 % el tiempo de reparación" },
    ],
    education: [{ title: "Técnico en Electricidad", organization: "INA", period: "2014", description: "" }],
    skills: ["Tableros eléctricos", "electricidad", "Domótica"],
  },
  idiomas: ["Español", "Inglés"],
  certificaciones: [{ name: "Trabajo en alturas", institution: "INS", year: "2023" }],
};

test("se prellena con el perfil, lo más reciente primero, sin habilidades repetidas", () => {
  const cv = prellenar(perfil, "es");
  expect(cv.nombre).toBe("Ana Mora");
  expect(cv.titular).toBe("Electricidad");
  expect(cv.experiencia.map((e) => e.title)).toEqual(["Electricista", "Técnica"]);
  // «electricidad» del CV y «Electricidad» del servicio son la misma habilidad.
  expect(cv.habilidades.filter((h) => h.toLowerCase() === "electricidad")).toHaveLength(1);
  expect(cv.certificaciones).toEqual(["Trabajo en alturas · INS · 2023"]);
  // Una cuenta sin ficha arranca con lo poco que hay, sin inventar nada.
  const vacio = prellenar({ nombre: "Luis", correo: "luis@example.com" }, "en");
  expect(vacio).toMatchObject({ nombre: "Luis", titular: "", resumen: "", experiencia: [], habilidades: [] });
});

test("fechas iguales en todo el documento, en cada idioma", () => {
  expect(fechasAts("01/2019 – Present", "es")).toBe("01/2019 – Actualidad");
  expect(fechasAts("01/2019 – Present", "en")).toBe("01/2019 – Present");
  expect(fechasAts("2014", "es")).toBe("2014");
});

test("la revisión señala lo que falta y lo que conviene mejorar", () => {
  const cv = prellenar(perfil, "es");
  const ids = revisarCv(cv).map((a) => a.id);
  // La experiencia de 2015 no tiene logros; lo demás está completo.
  expect(ids).toEqual(["logros"]);
  const flojo = { ...cv, nombre: "", correo: "", telefono: "", resumen: "", experiencia: [], habilidades: [] };
  expect(revisarCv(flojo).map((a) => a.id)).toEqual(expect.arrayContaining(["nombre", "contacto", "resumen", "experiencia", "habilidades"]));
  const sinVerbos = { ...cv, experiencia: [{ title: "Ayudante", organization: "", period: "", description: "Cosas varias del taller" }] };
  expect(revisarCv(sinVerbos).map((a) => a.id)).toEqual(expect.arrayContaining(["verbos", "numeros", "fechas"]));
});

test("la carta arranca con el puesto y avisa de lo que queda por completar", () => {
  const cv = prellenar(perfil, "es");
  const carta = cartaInicial(cv, { puesto: "Electricista de mantenimiento", empresa: "Hotel Atenas" });
  expect(carta.apertura).toBe("Les escribo para postularme al puesto de Electricista de mantenimiento en Hotel Atenas.");
  expect(carta.porQueEncajo).toContain("Como Electricista en Por cuenta propia");
  expect(revisarCarta(carta).map((a) => a.id)).toEqual(["corchetes"]);
  const texto = cartaComoTexto(cv, carta, new Date(2026, 10, 13));
  expect(texto.split("\n").slice(0, 2)).toEqual(["Ana Mora", "ana@example.com | 8888-5555 | Atenas, Alajuela, Costa Rica"]);
  expect(texto).toContain("Estimado Equipo de selección:");
  expect(texto.trim().endsWith("Saludos cordiales,\nAna Mora")).toBe(true);
  const ingles = cartaInicial(prellenar(perfil, "en"), { puesto: "Electrician" });
  expect(ingles.apertura).toBe("I am writing to apply for the Electrician position.");
});

test("texto para pegar: títulos estándar en el idioma del documento", () => {
  const es = cvComoTexto(prellenar(perfil, "es"));
  for (const titulo of ["PERFIL PROFESIONAL", "EXPERIENCIA", "EDUCACIÓN", "HABILIDADES", "IDIOMAS", "CERTIFICACIONES"]) expect(es).toContain(titulo);
  expect(es).toContain("Electricista — Por cuenta propia (01/2019 – Actualidad)");
  expect(es).toContain("- Instalé el sistema eléctrico de 40 casas");
  const en = cvComoTexto(prellenar(perfil, "en"));
  for (const titulo of ["PROFESSIONAL SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]) expect(en).toContain(titulo);
});

test("palabras de la vacante que están y que faltan en el CV", () => {
  const { estan, faltan } = palabrasClave("Buscamos electricista con experiencia en tableros, cámaras y licencia B1.", prellenar(perfil, "es"));
  expect(estan).toEqual(expect.arrayContaining(["electricista", "tableros", "cámaras"]));
  expect(faltan).toEqual(expect.arrayContaining(["licencia"]));
  expect(faltan).not.toContain("experiencia");
});

test("nombre de archivo que el reclutador encuentra", () => {
  expect(nombreDeArchivo("Ana María Mora", "CV", "es")).toBe("Ana-Maria-Mora-CV.pdf");
  expect(nombreDeArchivo("Ana Mora", "Carta", "en")).toBe("Ana-Mora-Cover-Letter.pdf");
  expect(nombreDeArchivo("", "CV", "es")).toBe("CV-CV.pdf");
});

test("el PDF lleva texto de verdad, con el contacto en el cuerpo", async () => {
  const cv = prellenar(perfil, "es");
  const pdf = Buffer.from(await (await pdfDelCv(cv)).arrayBuffer()).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  // jsPDF escribe el texto como operadores «(…) Tj»: se puede seleccionar y leer.
  expect(pdf).toContain("(Ana Mora) Tj");
  expect(pdf).toContain("(EXPERIENCIA) Tj");
  expect(pdf).toMatch(/\(ana@example\.com {2}\| {2}8888-5555/);
  expect(pdf).not.toMatch(/\/Subtype \/Image/);
  const carta = Buffer.from(await (await pdfDeLaCarta(cv, cartaInicial(cv, { puesto: "Electricista" }))).arrayBuffer()).toString("latin1");
  expect(carta).toContain("(Saludos cordiales,) Tj");
});
