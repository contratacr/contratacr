import { expect, test } from "playwright/test";
import {
  ajustarAVacante, cartaComoTexto, cartaInicial, cvComoTexto, esCertificacion, fechasAts, nombreDeArchivo, palabrasClave, prellenar, revisarCarta, revisarCv, saludoPorDefecto, saludosSugeridos, sumarDesdeArchivo,
} from "../../src/lib/cv/documento";
import { pdfDelCv, pdfDelCvEnBytes, pdfDeLaCarta } from "../../src/lib/cv/pdf-documento";
import { textoPlano, trozos } from "../../src/lib/cv/texto-rico";
import { htmlDeTexto, textoDeHtml } from "../../src/lib/cv/editor-formato";
import { cvDelPanelParaPublicar, cvPublico } from "../../src/lib/cv/cv-publico";
import { moverEnLista } from "../../src/components/dashboard/cv-arrastrar";
import { aplicarPlantilla, DISENO_BASE, disenoDe, esAptaAts, PLANTILLAS } from "../../src/lib/cv/diseno";
import { maquetar, nuevoDocumento, type Op } from "../../src/lib/cv/maquetar";
import { empresaProbable, imagenValida, limpiarTextoLeido, puestoProbable } from "../../src/lib/cv/leer-imagen";
import { aplicarSugerencias, cifras, cvParaIa, enPrimeraPersona, hechosNuevos, leerJson, nombresPropios, preguntaDeUsted, promptAdaptar, sinOracionesInventadas, validarAdaptacion, validarCarta, validarMejora } from "../../src/lib/cv/ia";
import { empresaDeLaOferta } from "../../src/components/dashboard/cv-ia";

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
    skills: ["Tableros eléctricos", "electricidad", "Domótica", "Cableado estructurado"],
  },
  idiomas: ["Español", "Inglés"],
  certificaciones: [{ name: "Trabajo en alturas", institution: "INS", year: "2023" }, { name: "Ingeniero de Software", institution: "ULACIT", year: "2021" }],
};

test("se prellena con el perfil, lo más reciente primero, sin habilidades repetidas", () => {
  const cv = prellenar(perfil, "es");
  expect(cv.nombre).toBe("Ana Mora");
  // El título sale del cargo más reciente, no del nombre del servicio.
  expect(cv.titular).toBe("Electricista");
  expect(cv.experiencia.map((e) => e.title)).toEqual(["Electricista", "Técnica"]);
  // «electricidad» del CV y «Electricidad» del servicio son la misma habilidad.
  expect(cv.habilidades.filter((h) => h.toLowerCase() === "electricidad")).toHaveLength(1);
  // Un título universitario guardado como «certificación» va en Educación.
  expect(cv.certificaciones).toEqual(["Trabajo en alturas · INS · 2023"]);
  expect(cv.educacion.map((e) => e.title)).toEqual(["Ingeniero de Software", "Técnico en Electricidad"]);
  // Los nombres de servicio no son habilidades: quedan como sugerencia.
  expect(cv.habilidades).not.toContain("Cámaras de seguridad");
  expect(cv.sugeridas).toContain("Cámaras de seguridad");
  // Una cuenta sin ficha arranca con lo poco que hay, sin inventar nada.
  const vacio = prellenar({ nombre: "Luis", correo: "luis@example.com" }, "en");
  expect(vacio).toMatchObject({ nombre: "Luis", titular: "", resumen: "", experiencia: [], habilidades: [], sugeridas: [] });
});

test("llenar desde un CV en archivo suma sin borrar ni repetir", () => {
  const base = prellenar(perfil, "es");
  const yaTenia = base.experiencia[0];
  const leido = {
    experience: [{ ...yaTenia }, { title: "Técnico de soporte", organization: "Helpdesk SA", period: "2015 - 2017", description: "" }],
    education: [{ title: "Bachillerato en Informática", organization: "UCR", period: "2014", description: "" }, { title: "Certificación ISTQB", organization: "ISTQB", period: "2020", description: "" }],
    skills: ["Liderazgo", "liderazgo"],
  };
  const { cv, agregadas } = sumarDesdeArchivo(base, leido);
  expect(cv.experiencia.filter((e) => e.title === yaTenia.title)).toHaveLength(1);
  expect(cv.experiencia.some((e) => e.title === "Técnico de soporte")).toBe(true);
  expect(cv.educacion.some((e) => e.title === "Bachillerato en Informática")).toBe(true);
  expect(cv.certificaciones.some((c) => c.startsWith("Certificación ISTQB"))).toBe(true);
  expect([...cv.habilidades, ...cv.sugeridas].filter((h) => h.toLowerCase() === "liderazgo")).toHaveLength(1);
  expect(cv.nombre).toBe(base.nombre);
  expect(agregadas).toBe(4);
  expect(sumarDesdeArchivo(cv, leido).agregadas).toBe(0);
});

test("títulos y certificaciones se distinguen", () => {
  expect(esCertificacion("Certificación ISTQB Foundation")).toBe(true);
  expect(esCertificacion("Curso de Excel avanzado", "INA")).toBe(true);
  expect(esCertificacion("Ingeniero de Software", "ULACIT")).toBe(false);
  expect(esCertificacion("Bachillerato en Administración", "UCR")).toBe(false);
  expect(esCertificacion("Técnico en Electricidad", "INA")).toBe(false);
});

test("habilidades: 8 por defecto, el resto como sugerencia, y la vacante manda", () => {
  const muchas = Array.from({ length: 14 }, (_, i) => `Habilidad ${i + 1}`);
  const cv = prellenar({ nombre: "Ana", cv: { experience: [], education: [], skills: [...muchas, "Playwright"] } }, "es");
  expect(cv.habilidades).toHaveLength(8);
  expect(cv.sugeridas).toContain("Playwright");
  // Desde una vacante que pide Playwright, sube primero y no pasa del tope.
  const ajustado = ajustarAVacante(cv, "Buscamos QA con Playwright y Habilidad 12");
  expect(ajustado.habilidades.slice(0, 2)).toEqual(["Habilidad 12", "Playwright"]);
  expect(ajustado.habilidades.length).toBeLessThanOrEqual(10);
  expect(ajustado.sugeridas).not.toContain("Playwright");
  expect(revisarCv({ ...cv, habilidades: muchas }).map((a) => a.id)).toContain("demasiadas");
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
  // «Liderazgo: Definí…» empieza con un verbo aunque lleve una etiqueta delante.
  const conEtiqueta = { ...cv, experiencia: [{ ...cv.experiencia[0], description: "Leadership: Defined coding standards for 3 teams" }] };
  expect(revisarCv(conEtiqueta).map((a) => a.id)).not.toContain("verbos");
  const largo = { ...cv, resumen: "x".repeat(600), experiencia: Array.from({ length: 12 }, () => ({ ...cv.experiencia[0], description: "Instalé 40 sistemas eléctricos completos en casas y comercios. ".repeat(8) })) };
  expect(revisarCv(largo).map((a) => a.id)).toContain("largo");
});

test("la carta arranca con el puesto y avisa de lo que queda por completar", () => {
  const cv = prellenar(perfil, "es");
  const carta = cartaInicial(cv, { puesto: "Electricista de mantenimiento", empresa: "Hotel Atenas" });
  expect(carta.apertura).toBe("Les escribo para postularme al puesto de Electricista de mantenimiento en Hotel Atenas.");
  expect(carta.porQueEncajo).toContain("Como electricista por cuenta propia,");
  expect(carta.porQueEncajo).not.toContain("en Por cuenta propia");
  expect(revisarCarta(carta).map((a) => a.id)).toEqual(["corchetes"]);
  const texto = cartaComoTexto(cv, carta, new Date(2026, 10, 13));
  expect(texto.split("\n").slice(0, 2)).toEqual(["Ana Mora", "ana@example.com | 8888-5555 | Atenas, Alajuela, Costa Rica"]);
  expect(texto).toContain("Equipo de selección\nHotel Atenas");
  expect(texto).toContain("Hotel Atenas\n\nPostulación al puesto de Electricista de mantenimiento\n\nEstimado equipo de selección:");
  // Sin empresa no se repite el destinatario antes del saludo.
  expect(cartaComoTexto(cv, { ...carta, empresa: "" })).not.toMatch(/Equipo de selección\n/);
  expect(texto.trim().endsWith("Saludos cordiales,\nAna Mora")).toBe(true);
  const ingles = cartaInicial(prellenar(perfil, "en"), { puesto: "Electrician" });
  expect(ingles.apertura).toBe("I am writing to apply for the Electrician position.");
});

test("texto para pegar: títulos estándar en el idioma del documento", () => {
  const es = cvComoTexto(prellenar(perfil, "es"));
  for (const titulo of ["RESUMEN PROFESIONAL", "EXPERIENCIA", "EDUCACIÓN", "HABILIDADES", "IDIOMAS", "CERTIFICACIONES"]) expect(es).toContain(titulo);
  expect(es).toContain("Electricista — Por cuenta propia (01/2019 – Actualidad)");
  expect(es).toContain("- Instalé el sistema eléctrico de 40 casas");
  const en = cvComoTexto(prellenar(perfil, "en"));
  for (const titulo of ["PROFESSIONAL SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]) expect(en).toContain(titulo);
});

test("secciones opcionales y ubicación por puesto: salen solo con contenido, igual en texto y PDF", async () => {
  const base = prellenar(perfil, "es");
  // Un borrador viejo, sin las secciones nuevas, se sigue leyendo igual.
  expect(cvComoTexto(base)).not.toMatch(/PROYECTOS|REFERENCIAS/);
  const cv = {
    ...base,
    experiencia: base.experiencia.map((e, i) => (i === 0 ? { ...e, location: "Atenas" } : e)),
    proyectos: [{ title: "Tienda en línea", organization: "Panadería Sol", period: "03/2024", description: "Ventas +30 % en 3 meses" }, { title: "", organization: "", period: "", description: "" }],
    referencias: [{ nombre: "Luis Rojas", cargo: "Gerente, Hotel Atenas", contacto: "8888-1111" }, { nombre: "", cargo: "", contacto: "" }],
    secciones: [{ titulo: "Voluntariado", texto: "Cruz Roja, 2022" }, { titulo: "Sin contenido", texto: "" }],
  };
  const texto = cvComoTexto(cv);
  expect(texto).toContain("Electricista — Por cuenta propia, Atenas (01/2019 – Actualidad)");
  expect(texto).toContain("PROYECTOS\nTienda en línea — Panadería Sol (03/2024)\n- Ventas +30 % en 3 meses");
  expect(texto).toContain("VOLUNTARIADO\nCruz Roja, 2022");
  expect(texto).not.toContain("SIN CONTENIDO");
  expect(texto.trimEnd().endsWith("REFERENCIAS\nLuis Rojas — Gerente, Hotel Atenas\n8888-1111")).toBe(true);
  // Los proyectos van después de la experiencia y antes de la educación.
  expect(texto.indexOf("PROYECTOS")).toBeGreaterThan(texto.indexOf("EXPERIENCIA"));
  expect(texto.indexOf("PROYECTOS")).toBeLessThan(texto.indexOf("EDUCACIÓN"));
  expect(cvComoTexto({ ...cv, idioma: "en" })).toContain("PROJECTS");
  expect(revisarCv({ ...cv, proyectos: [{ title: "App", organization: "", period: "", description: "[logro]" }] }).map((a) => a.id)).toContain("corchetes");
  const pdf = Buffer.from(await (await pdfDelCv(cv)).arrayBuffer()).toString("latin1");
  for (const linea of ["(PROYECTOS) Tj", "(REFERENCIAS) Tj", "(VOLUNTARIADO) Tj", "(Luis Rojas ", "Por cuenta propia, Atenas"]) expect(pdf).toContain(linea);
});

test("orden, secciones ocultas o renombradas y secciones nuevas: lo mismo en texto y PDF", async () => {
  const base = prellenar(perfil, "es");
  const cv = {
    ...base,
    cursos: [{ title: "Excel avanzado", organization: "INA", period: "2023", description: "" }],
    premios: [{ title: "Técnica del año", organization: "Eléctrica Sur", period: "2017", description: "" }],
    voluntariado: [{ title: "Brigadista", organization: "Cruz Roja", period: "2020", description: "Atendí 15 emergencias" }],
    publicaciones: [{ title: "Guía de cableado", organization: "Revista Hogar", period: "2022", description: "", hidden: true }],
    intereses: ["Ciclismo"],
    declaracion: { texto: "Declaro que la información es verdadera.", lugarFecha: "Atenas, 19 de noviembre de 2026" },
  };
  const texto = cvComoTexto(cv);
  for (const t of ["CURSOS\nExcel avanzado — INA (2023)", "PREMIOS\nTécnica del año — Eléctrica Sur (2017)", "VOLUNTARIADO Y ORGANIZACIONES\nBrigadista — Cruz Roja (2020)\n- Atendí 15 emergencias", "INTERESES\nCiclismo"]) expect(texto).toContain(t);
  // Una entrada oculta no sale, y su sección vacía tampoco.
  expect(texto).not.toContain("PUBLICACIONES");
  expect(texto.trimEnd().endsWith("DECLARACIÓN\nDeclaro que la información es verdadera.\nAtenas, 19 de noviembre de 2026\nAna Mora")).toBe(true);
  // La persona sube Habilidades arriba de todo, oculta Idiomas y renombra Experiencia.
  const propio = cvComoTexto({ ...cv, orden: ["habilidades", "resumen"], ocultas: ["idiomas"], titulosPropios: { experiencia: "Trayectoria" } });
  expect(propio.indexOf("HABILIDADES")).toBeLessThan(propio.indexOf("RESUMEN PROFESIONAL"));
  expect(propio).not.toContain("IDIOMAS");
  expect(propio).toContain("TRAYECTORIA\n");
  expect(propio).not.toContain("EXPERIENCIA\n");
  // Lo que no estaba en el orden guardado queda en su lugar de siempre.
  expect(propio.indexOf("TRAYECTORIA")).toBeLessThan(propio.indexOf("EDUCACIÓN"));
  expect(cvComoTexto({ ...cv, idioma: "en" })).toContain("VOLUNTEERING & ORGANIZATIONS");
  const pdf = Buffer.from(await (await pdfDelCv({ ...cv, orden: ["habilidades", "resumen"], ocultas: ["idiomas"], titulosPropios: { experiencia: "Trayectoria" } })).arrayBuffer()).toString("latin1");
  for (const linea of ["(CURSOS) Tj", "(TRAYECTORIA) Tj", "(INTERESES) Tj"]) expect(pdf).toContain(linea);
  expect(pdf).not.toContain("(IDIOMAS) Tj");
  expect(pdf).not.toContain("(PUBLICACIONES) Tj");
  expect(pdf.indexOf("(HABILIDADES) Tj")).toBeLessThan(pdf.indexOf("(RESUMEN PROFESIONAL) Tj"));
});

test("negrita, viñetas y enlaces: con formato en el PDF, sin marcas en el texto para pegar", async () => {
  expect(trozos("Lideré **12 obras** en [mi sitio](https://ana.cr) y https://x.cr/a.")).toEqual([
    { texto: "Lideré " }, { texto: "12 obras", negrita: true }, { texto: " en " }, { texto: "mi sitio", url: "https://ana.cr" }, { texto: " y " }, { texto: "https://x.cr/a", url: "https://x.cr/a" }, { texto: "." },
  ]);
  expect(textoPlano("**Lideré** el [portafolio](https://ana.cr)")).toBe("Lideré el portafolio (https://ana.cr)");
  const base = prellenar(perfil, "es");
  const cv = {
    ...base,
    resumen: "Electricista con **8 años** de experiencia.\n- Instalaciones residenciales\n- Reparaciones",
    experiencia: base.experiencia.map((e, i) => (i === 0 ? { ...e, description: "**Instalé** el sistema eléctrico de 40 casas\nVer [fotos](https://ana.cr/obras)" } : e)),
  };
  const texto = cvComoTexto(cv);
  expect(texto).toContain("Electricista con 8 años de experiencia.\n- Instalaciones residenciales\n- Reparaciones");
  expect(texto).toContain("- Instalé el sistema eléctrico de 40 casas\n- Ver fotos (https://ana.cr/obras)");
  expect(texto).not.toContain("**");
  // El verbo en negrita sigue contando como verbo de acción.
  expect(revisarCv(cv).map((a) => a.id)).not.toContain("verbos");
  const pdf = Buffer.from(await (await pdfDelCv(cv)).arrayBuffer()).toString("latin1");
  expect(pdf).toContain("(Instalé) Tj".replace("é", "\xe9"));
  expect(pdf).toContain("/URI (https://ana.cr/obras)");
  expect(pdf).not.toContain("**");
});

test("el editor con formato: lo guardado va y vuelve igual, y lo que arma el navegador se entiende", async ({ page }) => {
  const serializar = (html: string) => page.evaluate(([fn, h]) => {
    const raiz = document.createElement("div");
    raiz.innerHTML = h;
    return (new Function(`return (${fn})`)() as (r: Element) => string)(raiz);
  }, [textoDeHtml.toString(), html] as const);
  for (const texto of [
    "Electricista con **8 años** de experiencia.\n- Instalaciones residenciales\n- Ver [fotos](https://ana.cr/obras)\nY https://ana.cr",
    "Una línea\n\nOtra después de una vacía",
    "Precios <menores> & \"buenos\"",
  ]) expect(await serializar(htmlDeTexto(texto, true))).toBe(texto);
  // En un logro cada línea ya es viñeta: un «- » escrito a mano queda como texto.
  expect(htmlDeTexto("- Instalé 40 casas", false)).toBe("<div>- Instalé 40 casas</div>");
  // Lo que arman Chrome y Safari al escribir y usar la barrita.
  expect(await serializar("Primera<div>Segunda</div><div><br></div><div>Cuarta <b>fuerte </b>fin</div>")).toBe("Primera\nSegunda\n\nCuarta **fuerte** fin");
  expect(await serializar("<div><ul><li>uno</li><li><span style=\"font-weight: 700\">dos</span></li></ul></div><div>después</div>")).toBe("- uno\n- **dos**\ndespués");
  expect(await serializar("<div>ver <a href=\"https://x.cr\">mi sitio</a> y <a href=\"javascript:alert(1)\">esto</a></div>")).toBe("ver [mi sitio](https://x.cr) y esto");
  // Lo que no es del editor (estilos, imágenes, scripts) se descarta.
  expect(await serializar("<div><i>hola</i><img src=x><script>1</script>&nbsp;chau</div>")).toBe("hola chau");
});

test("palabras de la vacante que están y que faltan en el CV", () => {
  const { estan, faltan } = palabrasClave("Buscamos electricista con experiencia en tableros, cámaras y licencia B1.", prellenar(perfil, "es"));
  expect(estan).toEqual(expect.arrayContaining(["electricista", "tableros"]));
  // «Cámaras de seguridad» es un servicio: queda como sugerencia, no en el CV.
  expect(faltan).toEqual(expect.arrayContaining(["licencia", "cámaras"]));
  expect(faltan).not.toContain("experiencia");
});

test("adaptar a una vacante: puntaje, sin relleno, y los logros afines suben sin reescribirse", () => {
  const cv = prellenar(perfil, "es");
  const vacante = "Buscamos electricista residencial. Requisitos: tableros eléctricos, cableado estructurado y licencia B1. Ofrecemos buen ambiente. Tableros y licencia son indispensables.";
  const { estan, faltan, puntaje } = palabrasClave(vacante, cv);
  expect(estan).toEqual(expect.arrayContaining(["electricista", "tableros"]));
  expect(faltan).toContain("licencia");
  expect([...estan, ...faltan]).not.toEqual(expect.arrayContaining(["buscamos"]));
  expect([...estan, ...faltan]).not.toEqual(expect.arrayContaining(["ofrecemos"]));
  expect(puntaje).toBeGreaterThan(0);
  expect(puntaje).toBeLessThan(100);
  expect(palabrasClave("", cv).puntaje).toBe(0);
  const conLogros = { ...cv, experiencia: [{ title: "Electricista", organization: "X", period: "2020", description: "Atendí llamadas de clientes\nInstalé tableros eléctricos en 40 casas" }] };
  const ajustado = ajustarAVacante(conLogros, vacante);
  expect(ajustado.experiencia[0].description.split("\n")).toEqual(["Instalé tableros eléctricos en 40 casas", "Atendí llamadas de clientes"]);
  // Mismas frases, solo otro orden.
  expect([...ajustado.experiencia[0].description.split("\n")].sort()).toEqual([...conLogros.experiencia[0].description.split("\n")].sort());
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

test("el PDF del perfil público: lo que el perfil ya muestra, sin correo ni teléfono", async () => {
  const publico = {
    slug: "ana-mora-ab12cd34", fullName: "Ana Mora", bio: "Electricista residencial con 8 años de experiencia.",
    provinceName: "San José", cantonName: "Escazú", languages: [], services: [{ name: "Instalaciones eléctricas" }],
    certifications: [{ name: "Técnico en electricidad", institution: "INA", year: "2018" }],
    cvProfile: { education: [], experience: [{ title: "Electricista", organization: "Hotel Atenas", period: "2019", description: "Instalé tableros en 40 casas" }], skills: ["Tableros eléctricos"] },
  };
  const cv = cvPublico(publico, "es")!;
  expect(cv.correo).toBe("");
  expect(cv.telefono).toBe("");
  expect(cv.ubicacion).toBe("Escazú, San José, Costa Rica");
  expect(cv.enlace).toMatch(/\/ana-mora$/);
  const pdf = Buffer.from(await pdfDelCvEnBytes(cv)).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).toContain("(Ana Mora) Tj");
  // Sin estudios, experiencia, habilidades ni certificaciones no hay PDF que mostrar.
  expect(cvPublico({ ...publico, certifications: [], cvProfile: null }, "es")).toBeNull();
});

test("lo leído de una foto de la vacante se limpia y propone el puesto", () => {
  const leido = "SE BUSCA\n\nElectricista de mantenimiento |\nHotel  Atenas\n\n\n\n- Licencia B1 ~\n_";
  const limpio = limpiarTextoLeido(leido);
  expect(limpio).toBe("SE BUSCA\n\nElectricista de mantenimiento\nHotel Atenas\n\n- Licencia B1");
  expect(puestoProbable(limpio)).toBe("Electricista de mantenimiento");
  expect(puestoProbable("Se busca: Cajero bilingüe\nTiempo completo")).toBe("Cajero bilingüe");
  expect(empresaProbable("QA\nRequisitos\nEmpresa: Hotel Atenas")).toBe("Hotel Atenas");
  expect(empresaProbable("Sin datos de la empresa")).toBe("");
  expect(imagenValida(new File(["x"], "v.png", { type: "image/png" }))).toBe("ok");
  expect(imagenValida(new File(["x"], "v.pdf", { type: "application/pdf" }))).toBe("tipo");
});

// ── DISEÑO (19-nov-2026) ── la vista previa y el PDF salen de la misma maqueta.
const textos = (ops: Op[]) => ops.flatMap((o) => (o.t === "texto" ? [o.s] : []));
const paginasDelPdf = (pdf: string) => (pdf.match(/\/Type \/Page\b(?!s)/g) ?? []).length;

test("diseño: sin diseño se ve como siempre, y lo raro o viejo cae en la Clásica", () => {
  expect(disenoDe({})).toEqual(DISENO_BASE);
  expect(disenoDe({ diseno: null })).toEqual(DISENO_BASE);
  // Un borrador viejo con «plantilla: moderna» (ya quitada) no cambia nada.
  const viejo = { ...prellenar(perfil, "es"), plantilla: "moderna" as const };
  expect(disenoDe(viejo)).toEqual(DISENO_BASE);
  const raro = disenoDe({ diseno: { columnas: "tres", tamano: 9, color: "rojo", fuente: "comic", formato: "a4", margen: 3 } as never });
  expect(raro).toEqual({ ...DISENO_BASE, formato: "a4", margen: 3 });
  // Cada plantilla es una combinación válida, y las de una columna son las aptas para ATS.
  for (const p of PLANTILLAS) {
    expect(disenoDe({ diseno: aplicarPlantilla(p.id) })).toEqual(aplicarPlantilla(p.id));
    expect(esAptaAts(p.diseno)).toBe(p.diseno.columnas === "una");
  }
  expect(fechasAts("03/2021 – Present", "es", "mes")).toBe("Mar 2021 – Actualidad");
  expect(fechasAts("03/2021 – 08/2021", "en", "anio")).toBe("2021");
  expect(fechasAts("03/2021 – 08/2023", "es", "numero")).toBe("03/2021 – 08/2023");
});

test("diseño: cambiar de plantilla no toca el contenido ni el texto para pegar", async () => {
  const cv = prellenar(perfil, "es");
  for (const p of PLANTILLAS) expect(cvComoTexto({ ...cv, diseno: aplicarPlantilla(p.id) })).toBe(cvComoTexto(cv));
  // Y la Clásica dibuja exactamente lo mismo que un documento sin diseño.
  const doc = await nuevoDocumento(cv);
  expect(maquetar(doc, { ...cv, diseno: aplicarPlantilla("clasica") })).toEqual(maquetar(doc, cv));
});

test("diseño: el PDF sigue el tamaño de página, la letra y las dos columnas, con las mismas páginas que la vista previa", async () => {
  const base = prellenar(perfil, "es");
  const carta = Buffer.from(await (await pdfDelCv(base)).arrayBuffer()).toString("latin1");
  expect(carta).toContain("/MediaBox [0 0 612. 792.]");
  const a4 = Buffer.from(await (await pdfDelCv({ ...base, diseno: { ...DISENO_BASE, formato: "a4", fuente: "times" } })).arrayBuffer()).toString("latin1");
  expect(a4).toMatch(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/);
  // jsPDF declara siempre sus 14 letras; lo que cuenta es cuál usa el texto.
  const usadas = (pdf: string) => new Set([...pdf.matchAll(/\/(F\d+) [\d.]+ Tf/g)].map((x) => x[1]));
  const id = (pdf: string, nombre: string) => [...pdf.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((x) => ({ f: x[1], obj: x[2] }))
    .find(({ obj }) => new RegExp(`(?:^|\\n)${obj} 0 obj\\s*<<\\s*/Type /Font\\s*/BaseFont /${nombre}\\b`).test(pdf))?.f;
  expect(usadas(a4).has(id(a4, "Times-Bold")!)).toBe(true);
  expect(usadas(a4).has(id(a4, "Helvetica-Bold")!)).toBe(false);
  expect(usadas(carta).has(id(carta, "Helvetica-Bold")!)).toBe(true);

  // Dos columnas: certificaciones, habilidades e idiomas a la izquierda, lo demás a la derecha; todo es texto.
  const lateral = { ...base, diseno: aplicarPlantilla("lateral") };
  const doc = await nuevoDocumento(lateral);
  const m = maquetar(doc, lateral);
  const op = (s: string) => m.paginas[0].find((o) => o.t === "texto" && o.s === s) as Extract<Op, { t: "texto" }>;
  expect(op("HABILIDADES").x).toBeLessThan(op("EXPERIENCIA").x);
  // Las dos columnas arrancan a la misma altura, debajo del encabezado.
  expect(Math.abs(op("CERTIFICACIONES").y - op("RESUMEN PROFESIONAL").y)).toBeLessThan(1);
  expect(m.paginas[0].some((o) => o.t === "caja" && o.x === 0)).toBe(true);
  const pdf = Buffer.from(await (await pdfDelCv(lateral)).arrayBuffer()).toString("latin1");
  for (const t of ["(HABILIDADES) Tj", "(EXPERIENCIA) Tj", "(Ana Mora) Tj"]) expect(pdf).toContain(t);
  expect(pdf).not.toMatch(/\/Subtype \/Image/);

  // Letra grande y márgenes amplios en A4: más páginas, las mismas en la maqueta y en el PDF.
  const largo = {
    ...base,
    experiencia: Array.from({ length: 8 }, (_, i) => ({ title: `Electricista ${i + 1}`, organization: "Eléctrica Sur", period: "02/2015 – 12/2018", description: "Instalé tableros en 40 casas\nReduje 20 % el tiempo de reparación\nCapacité a 5 aprendices" })),
    diseno: { ...DISENO_BASE, formato: "a4" as const, tamano: 5 as const, margen: 3 as const, interlineado: 3 as const, espacio: 3 as const },
  };
  const ml = maquetar(await nuevoDocumento(largo), largo);
  expect(ml.paginas.length).toBeGreaterThan(1);
  const pdfLargo = Buffer.from(await (await pdfDelCv(largo)).arrayBuffer()).toString("latin1");
  expect(paginasDelPdf(pdfLargo)).toBe(ml.paginas.length);
  // Ningún texto se sale del área de la página.
  for (const pagina of ml.paginas) for (const o of pagina) if (o.t === "texto") {
    expect(o.y).toBeLessThanOrEqual(ml.alto - 72 + 0.5);
    expect(o.x + o.ancho).toBeLessThanOrEqual(ml.ancho - 72 + 0.5);
  }
  expect(textos(ml.paginas.flat())).toContain("EXPERIENCIA");
});

test("diseño: fechas a la derecha, habilidades en etiquetas o con nivel, y la carta con el mismo encabezado", async () => {
  const base = prellenar(perfil, "es");
  const cv = { ...base, niveles: { "Tableros eléctricos": 4 }, diseno: { ...DISENO_BASE, fechas: "derecha" as const, formatoFecha: "mes" as const, habilidades: "niveles" as const, color: "#009fd9" } };
  const doc = await nuevoDocumento(cv);
  const m = maquetar(doc, cv);
  const ops = m.paginas.flat();
  const titulo = ops.find((o) => o.t === "texto" && o.s.startsWith("Electricista — Por cuenta propia")) as Extract<Op, { t: "texto" }>;
  const fecha = ops.find((o) => o.t === "texto" && o.s === "Ene 2019 – Actualidad") as Extract<Op, { t: "texto" }>;
  expect(fecha.y).toBe(titulo.y);
  expect(fecha.x).toBeGreaterThan(titulo.x + titulo.ancho);
  // 4 de 5 puntos llenos con el color elegido, solo en la habilidad con nivel.
  const puntos = ops.filter((o) => o.t === "punto");
  expect(puntos).toHaveLength(5);
  expect(puntos.filter((o) => o.t === "punto" && o.color.join() === "0,159,217")).toHaveLength(4);
  const etiquetas = maquetar(doc, { ...cv, diseno: { ...cv.diseno, habilidades: "etiquetas" } }).paginas.flat();
  expect(etiquetas.filter((o) => o.t === "caja" && o.seccion === "habilidades").length).toBe(base.habilidades.length);
  // La carta usa la letra, el color y el encabezado del diseño.
  const conDiseno = { ...base, diseno: aplicarPlantilla("ejecutiva") };
  const mc = maquetar(doc, conDiseno, cartaInicial(conDiseno, { puesto: "Electricista" })).paginas.flat();
  const nombre = mc.find((o) => o.t === "texto" && o.s === "Ana Mora") as Extract<Op, { t: "texto" }>;
  expect(nombre.fuente).toBe("times");
  expect(nombre.color.join()).toBe("31,58,95");
  const pdfCarta = Buffer.from(await (await pdfDeLaCarta(conDiseno, cartaInicial(conDiseno, { puesto: "Electricista" }))).arrayBuffer()).toString("latin1");
  expect(pdfCarta).toContain("(Saludos cordiales,) Tj");
});

// ── FASE 3 (20-nov-2026): la carta completa, la firma a mano y el CV público ──
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("carta completa: destinatario, fecha, asunto, saludo y despedida propios; sin ellos queda como antes", () => {
  const cv = prellenar(perfil, "es");
  const carta = cartaInicial(cv, { puesto: "Electricista de mantenimiento", empresa: "Hotel Atenas" });
  const completa = {
    ...carta, destinatario: "Laura Solís", cargo: "Jefa de Recursos Humanos", direccion: "Atenas, Alajuela",
    fecha: "2026-12-01", asunto: "Asunto: Postulación a Electricista", saludo: "Estimada Laura Solís:", despedida: "Atentamente,",
    porQueLaEmpresa: "Me interesa **su hotel** por sus [obras recientes](https://hotel.cr).",
  };
  const texto = cartaComoTexto(cv, completa);
  expect(texto).toContain("1 de diciembre de 2026\n\nLaura Solís\nJefa de Recursos Humanos\nHotel Atenas\nAtenas, Alajuela\n\nAsunto: Postulación a Electricista\n\nEstimada Laura Solís:");
  // El texto para pegar va sin marcas de formato.
  expect(texto).toContain("Me interesa su hotel por sus obras recientes (https://hotel.cr).");
  expect(texto.trim().endsWith("Atentamente,\nAna Mora")).toBe(true);
  // Una fecha mal escrita no rompe: sale la de hoy.
  expect(cartaComoTexto(cv, { ...carta, fecha: "mañana" }, new Date(2026, 10, 13))).toContain("13 de noviembre de 2026");
  // Sin los campos nuevos, el mismo texto de siempre.
  expect(cartaComoTexto(cv, carta, new Date(2026, 10, 13))).toContain("Hotel Atenas\n\nPostulación al puesto de Electricista de mantenimiento\n\nEstimado equipo de selección:");
  expect(saludosSugeridos(completa, "es")).toEqual(expect.arrayContaining(["Estimado Laura Solís:", "Estimada Laura Solís:", "Estimado equipo de Hotel Atenas:"]));
  expect(saludoPorDefecto(carta, "es")).toBe("Estimado equipo de selección:");
  // Con un nombre, el saludo por defecto no supone el género (19-nov-2026).
  expect(saludoPorDefecto(completa, "es")).toBe("Buen día, Laura Solís:");
});

test("firma a mano: sale en la carta y en la declaración, en la vista previa y en el PDF; una inválida no", async () => {
  const cv = prellenar(perfil, "es");
  const doc = await nuevoDocumento(cv);
  const carta = { ...cartaInicial(cv, { puesto: "Electricista" }), firma: PNG };
  const ops = maquetar(doc, cv, carta).paginas.flat();
  const firma = ops.find((o) => o.t === "imagen") as Extract<Op, { t: "imagen" }>;
  expect(firma.w / firma.h).toBe(3);
  // Va entre la despedida y el nombre.
  const despedida = ops.find((o) => o.t === "texto" && o.s === "Saludos cordiales,") as Extract<Op, { t: "texto" }>;
  const nombre = ops.filter((o) => o.t === "texto" && o.s === "Ana Mora").at(-1) as Extract<Op, { t: "texto" }>;
  expect(firma.y).toBeGreaterThan(despedida.y);
  expect(nombre.y).toBeGreaterThan(firma.y + firma.h);
  const pdf = Buffer.from(await (await pdfDeLaCarta(cv, carta)).arrayBuffer()).toString("latin1");
  expect(pdf).toContain("/Subtype /Image");
  // Algo que no es un PNG en data URL no se dibuja.
  expect(maquetar(doc, cv, { ...carta, firma: "javascript:alert(1)" }).paginas.flat().some((o) => o.t === "imagen")).toBe(false);
  const conDeclaracion = { ...cv, declaracion: { texto: "Declaro que es verdad.", lugarFecha: "Atenas", firma: PNG } };
  expect(maquetar(doc, conDeclaracion).paginas.flat().filter((o) => o.t === "imagen")).toHaveLength(1);
  // El texto para pegar no cambia con la firma.
  expect(cvComoTexto(conDeclaracion)).toBe(cvComoTexto({ ...conDeclaracion, declaracion: { ...conDeclaracion.declaracion, firma: undefined } }));
});

test("CV público elegido en el panel: sin correo, teléfono ni firma; datos raros no se publican", () => {
  const cv = { ...prellenar(perfil, "es"), declaracion: { texto: "Declaro.", lugarFecha: "Atenas", firma: PNG } };
  const publico = cvDelPanelParaPublicar({ cv, carta: {} }, "contratacr.com/ana-mora");
  expect(publico).not.toBeNull();
  expect(publico!.correo).toBe("");
  expect(publico!.telefono).toBe("");
  expect(publico!.declaracion?.firma).toBeUndefined();
  expect(publico!.experiencia).toEqual(cv.experiencia);
  expect(cvComoTexto(publico!)).not.toContain("ana@example.com");
  expect(cvDelPanelParaPublicar({ cv: { nombre: "" } }, "x")).toBeNull();
  expect(cvDelPanelParaPublicar({ cv: { nombre: "Ana", experiencia: "no" } }, "x")).toBeNull();
  expect(cvDelPanelParaPublicar(null, "x")).toBeNull();
});

test("arrastrar para ordenar mueve el elemento a donde se soltó", () => {
  expect(moverEnLista(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  expect(moverEnLista(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
});

// ── FASE 4 (20-nov-2026): la IA reescribe, no inventa ──
test("IA: al modelo no va el contacto, y lo que inventa se descarta", () => {
  const cv = prellenar(perfil, "es");
  const f = cvParaIa(cv);
  const enviado = JSON.stringify(promptAdaptar(f, "Hotel Atenas busca Electricista de mantenimiento con lectura de planos y licencia B1."));
  for (const dato of ["ana@example.com", "8888-5555", "Ana Mora", "Atenas, Alajuela"]) expect(enviado).not.toContain(dato);

  // Cifras y nombres nuevos, en dígitos o en palabras.
  expect([...cifras("Atendí cinco clientes y 1.200 llamadas")]).toEqual(expect.arrayContaining(["5", "1200"]));
  expect(nombresPropios("Instalé tableros en Walmart con AutoCAD. Reparé breakers")).toEqual(["Walmart", "AutoCAD"]);
  expect(nombresPropios("Atendí clientes del INA")).toEqual(["INA"]);
  const fuente = "Instalé el sistema eléctrico de 40 casas\nTécnico en Electricidad, INA";
  expect(hechosNuevos("Instalé y mantuve el sistema eléctrico de 40 viviendas", fuente)).toEqual([]);
  expect(hechosNuevos("Instalé el sistema eléctrico de 45 casas", fuente)).toEqual(["45"]);
  expect(hechosNuevos("Mantuve sistemas eléctricos en Hotel Atenas", fuente)).toEqual(expect.arrayContaining(["Hotel", "Atenas"]));
  expect(hechosNuevos("Certificado por el INA en electricidad", fuente)).toEqual([]);

  const exp = f.entradas.find((e) => e.titulo === "Electricista")!;
  const r = validarAdaptacion({
    titular: "Electricista de mantenimiento",
    resumen: "Electricista con 8 años de experiencia en instalaciones y reparaciones para hogares y comercios.",
    entradas: [
      { id: exp.id, logros: ["Instalé y puse en marcha el sistema eléctrico de 40 casas", "Reduje 20 % el tiempo de reparación", "Lideré un equipo de 6 técnicos en Hotel Atenas"] },
      { id: "experiencia:99", logros: ["Entrada que no existe"] },
    ],
    habilidades: ["Lectura de planos", "Tableros eléctricos", "Licencia B1", "Electricidad"],
    preguntas: ["¿Tienes licencia B1?"],
  }, f)!;
  expect(r).not.toBeNull();
  const logros = r.sugerencias.find((s) => s.tipo === "logros");
  expect(logros && logros.tipo === "logros" && logros.despues).toEqual(["Instalé y puse en marcha el sistema eléctrico de 40 casas", "Reduje 20 % el tiempo de reparación"]);
  // "Licencia B1" y "Lectura de planos" no son de la persona: no se eligen.
  const hab = r.sugerencias.find((s) => s.tipo === "habilidades");
  expect(hab && hab.tipo === "habilidades" && hab.despues.includes("Licencia B1")).toBeFalsy();
  expect(r.descartadas).toBeGreaterThanOrEqual(2);
  expect(r.preguntas).toEqual(["¿Tiene licencia B1?"]); // el modelo preguntó de tú; sale de usted

  // Aplicar solo cambia lo aceptado y en una copia; la que sale de las habilidades vuelve a las sugeridas.
  const aplicado = aplicarSugerencias(cv, r.sugerencias);
  expect(cv.titular).not.toBe("Electricista de mantenimiento");
  expect(aplicado.titular).toBe("Electricista de mantenimiento");
  expect(aplicado.experiencia.find((e) => e.title === "Electricista")!.description).toContain("puse en marcha");
  expect(aplicado.experiencia.map((e) => [e.title, e.organization, e.period])).toEqual(cv.experiencia.map((e) => [e.title, e.organization, e.period]));
});

test("IA: forma de la respuesta, mejoras y carta sin datos ajenos", () => {
  expect(leerJson("```json\n{\"opciones\": [\"a\"]}\n```")).toEqual({ opciones: ["a"] });
  expect(leerJson("no es json")).toBeNull();
  const cv = prellenar(perfil, "es");
  const f = cvParaIa(cv);
  expect(validarAdaptacion({ titular: 5 }, f)).toBeNull();
  // Lo que no cambia nada no se muestra como sugerencia.
  expect(validarAdaptacion({ resumen: `${f.resumen} ` }, f)!.sugerencias).toEqual([]);

  const m = validarMejora({ opciones: ["Instalé el sistema eléctrico de 40 casas", "Instalé el sistema eléctrico de 400 casas", "- Instalé redes en 40 casas\n- Reduje tiempos"] }, "Instalé el sistema eléctrico de 40 casas.", "Electricista", "logros")!;
  expect(m.opciones).toEqual(["Instalé redes en 40 casas\nReduje tiempos"]);
  expect(m.descartadas).toBe(1);

  const oferta = "Hotel Atenas busca Electricista de mantenimiento. Requisitos: 5 años de experiencia y licencia B1.";
  const d = { puesto: "Electricista de mantenimiento", empresa: "Hotel Atenas", destinatario: "" };
  const c = validarCarta({
    apertura: "Postulo al puesto de Electricista de mantenimiento en Hotel Atenas.",
    porQueEncajo: "Tengo 5 años de experiencia en hoteles.",
    porQueLaEmpresa: "Me atrae que Hotel Atenas ofrezca estabilidad a su equipo.",
    cierre: "Quedo atento a una entrevista.",
  }, f, oferta, d)!;
  expect(c.carta.apertura).toContain("Hotel Atenas");
  // "5 años" sale de la oferta, no del CV: ese párrafo se cambia por uno a completar.
  expect(c.carta.porQueEncajo).toMatch(/^\[/);
  expect(c.carta.porQueLaEmpresa).toContain("estabilidad");
  expect(c.descartadas).toBe(1);

  // Lo que salió de una corrida real (20-nov-2026): una pregunta metida en la
  // carta y "B1" leído como la cifra 1. La pregunta se quita; lo demás queda.
  const real = validarCarta({
    apertura: "Postulo al puesto de Electricista de mantenimiento en Hotel Atenas.",
    porQueEncajo: "Instalé sistemas eléctricos en 40 viviendas. ¿Poseo licencia B1 y disponibilidad para turnos rotativos?",
    porQueLaEmpresa: "Valoro la estabilidad que brinda Hotel Atenas.",
    cierre: "Quedo a la espera de coordinar una entrevista.",
  }, f, oferta, d)!;
  expect(real.carta.porQueEncajo).toBe("Instalé sistemas eléctricos en 40 viviendas.");
  // Del puesto sí se pueden repetir las cifras de la oferta; de la persona, no.
  const puesto = validarCarta({ apertura: "Postulo a Electricista en un hotel con 5 años de trayectoria.", porQueEncajo: "Tengo 5 años en hoteles.", porQueLaEmpresa: "Me atrae su equipo.", cierre: "Quedo atento." }, f, oferta, d)!;
  expect(puesto.carta.apertura).toContain("5 años");
  expect(puesto.carta.porQueEncajo).toMatch(/^\[/);
  expect(real.descartadas).toBe(1);
  expect([...cifras("Licencia B1 y C1, 4x4")]).toEqual([]);
  expect(hechosNuevos("Tengo licencia B1", "Licencia C1")).toEqual(["B1"]);
  expect(sinOracionesInventadas("Atendí 12 mesas. Atendí 30 mesas.", (o) => o.includes("30"))).toEqual({ texto: "Atendí 12 mesas.", quitadas: 1 });
  expect(validarMejora({ opciones: ["Instalé sistemas en 40 casas (¿con qué resultado?)"] }, "Instalé el sistema eléctrico de 40 casas", "", "logros")!.opciones).toEqual([]);

  // Tercera persona en el primer verbo de un logro (corrida real): se corrige.
  expect(enPrimeraPersona("Instaló tableros eléctricos", "es")).toBe("Instalé tableros eléctricos");
  expect(enPrimeraPersona("Atendió emergencias", "es")).toBe("Atendí emergencias");
  expect(enPrimeraPersona("Leyó planos", "es")).toBe("Leí planos");
  expect(enPrimeraPersona("Instalé tableros", "es")).toBe("Instalé tableros");
  expect(enPrimeraPersona("Installed panels", "en")).toBe("Installed panels");
  // Las palabras clave no cuentan el nombre de la empresa ni verbos del anuncio, y la educación sí cuenta.
  const pc = palabrasClave("Hotel Atenas busca Electricista con título técnico del INA y lectura de planos.", prellenar(perfil, "es"));
  const todas = [...pc.estan, ...pc.faltan].map((p) => p.toLowerCase());
  expect(todas).not.toContain("hotel");
  expect(todas).not.toContain("busca");
  expect(pc.estan.map((p) => p.toLowerCase())).toContain("técnico");

  expect(empresaDeLaOferta("Hotel Atenas busca Electricista de mantenimiento.")).toBe("Hotel Atenas");
  expect(empresaDeLaOferta("Se necesita soldador")).toBe("");
  expect(empresaDeLaOferta("Empresa de logística busca Chofer")).toBe("");
  expect(empresaDeLaOferta("Gorilla Logic is hiring a Mid Frontend Engineer")).toBe("Gorilla Logic");
});

// La app trata de usted (19-nov-2026): si el modelo pregunta de tú o de vos,
// se corrige; los sustantivos parecidos («cuentas por cobrar», «programas») no.
test("las preguntas de la IA a la persona salen de usted", () => {
  const casos: [string, string][] = [
    ["¿Tienes licencia B1 vigente?", "¿Tiene licencia B1 vigente?"],
    ["¿Cuántos clientes atendiste por día?", "¿Cuántos clientes atendió por día?"],
    ["¿Cuentas con disponibilidad para turnos rotativos?", "¿Cuenta con disponibilidad para turnos rotativos?"],
    ["¿Has trabajado en hoteles?", "¿Ha trabajado en hoteles?"],
    ["¿Tenés curso de manipulación de alimentos?", "¿Tiene curso de manipulación de alimentos?"],
    ["¿Hablás inglés con huéspedes?", "¿Habla inglés con huéspedes?"],
    ["¿Hiciste mantenimiento preventivo en tus trabajos?", "¿Hizo mantenimiento preventivo en sus trabajos?"],
    ["¿Cuántos tableros instalabas por mes?", "¿Cuántos tableros instalaba por mes?"],
    ["¿Te interesa trabajar fines de semana?", "¿Le interesa trabajar fines de semana?"],
    ["¿Cuántas cuentas por cobrar manejabas?", "¿Cuántas cuentas por cobrar manejaba?"],
    ["¿Qué programas de contabilidad usas?", "¿Qué programas de contabilidad usa?"],
    ["¿Existe un proyecto que lideraste?", "¿Existe un proyecto que lideró?"],
    ["¿Tiene licencia B1?", "¿Tiene licencia B1?"],
  ];
  for (const [antes, despues] of casos) expect(preguntaDeUsted(antes, "es")).toBe(despues);
  expect(preguntaDeUsted("Do you have a B1 license?", "en")).toBe("Do you have a B1 license?");
  expect(promptAdaptar(cvParaIa(prellenar(perfil, "es")), "Se busca electricista").system).toContain("tratándola de usted");
});
