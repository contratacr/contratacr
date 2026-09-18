/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Una cuenta de SOLO cliente en el entorno de prueba.
 *
 * Las dos cuentas de regresión (Estudio Delta y Redes Bahía) son las dos
 * profesionales, así que no había forma de ver el app como lo ve alguien que
 * solo contrata: el panel del cliente, sus proyectos, sus favoritos y sus
 * reseñas. Esta la crea, con datos suficientes para que ninguna pantalla salga
 * vacía por accidente.
 *
 * Se niega a correr fuera del proyecto de prueba.
 */
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const TEST_PROJECT_REF = "oqheayqqprpciqdvdaqo";
const PROD_PROJECT_REF = "kskueodxaksxvjrysouw";
const ACTORES = require("./actores-de-regresion.json");

const EMAIL = "cliente.pruebas@contratacr.test";
const NOMBRE = "Andrea Vargas Rojas";
const TELEFONO = "+506 7000 0055";
const CEDULA = "118450789";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const password = process.env.CLIENTE_TEST_PASSWORD || "";

if (!url || !serviceRole || !password) {
  throw new Error("Faltan las credenciales de test o CLIENTE_TEST_PASSWORD.");
}
if (url.includes(PROD_PROJECT_REF) || !url.includes(TEST_PROJECT_REF)) {
  throw new Error("Esta cuenta solo se crea en el proyecto de prueba.");
}
if (password.length < 12) {
  throw new Error("CLIENTE_TEST_PASSWORD necesita al menos 12 caracteres.");
}

const db = createClient(url, serviceRole, { auth: { persistSession: false } });

function idEstable(semilla) {
  const h = crypto.createHash("sha256").update(`cuenta-cliente:${semilla}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// La metadata de esta cuenta se escribe entera, no se mezcla con lo que hubiera
// antes. `professional_signup_started` es la razón: con esa bandera puesta el
// middleware saca del panel y manda al registro profesional ("me entra a
// completa tu perfil profesional"), y basta con que alguien haya abierto ese
// formulario una vez con esta sesión para que se quede pegada. Una cuenta de
// solo cliente tiene que arrancar limpia cada vez que se siembra.
const METADATA = {
  full_name: NOMBRE,
  is_provider: false,
  role: "client",
  onboarding_completed: true,
  professional_signup_started: false,
};

async function buscarUsuario() {
  for (let pagina = 1; pagina <= 10; pagina += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    const encontrado = (data?.users ?? []).find((u) => u.email === EMAIL);
    if (encontrado) return encontrado;
    if ((data?.users ?? []).length < 200) break;
  }
  return null;
}

async function main() {
  let usuario = await buscarUsuario();
  if (usuario) {
    // La contraseña NO se vuelve a escribir en una cuenta que ya existe:
    // Supabase revoca todas las sesiones cuando una contraseña cambia, así que
    // resembrar los datos cerraba la sesión abierta en el navegador. Los datos
    // se pueden refrescar cuantas veces haga falta sin sacar a nadie.
    // Con RESEMBRAR_CONTRASENA=1 se vuelve a poner (y entonces sí hay que
    // entrar de nuevo).
    const rehacerClave = process.env.RESEMBRAR_CONTRASENA === "1";
    await db.auth.admin.updateUserById(usuario.id, {
      ...(rehacerClave ? { password } : {}),
      email_confirm: true,
      user_metadata: { ...(usuario.user_metadata ?? {}), ...METADATA },
    });
    if (rehacerClave) console.log("  contraseña reescrita: la sesión abierta se cerró.");
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: METADATA,
    });
    if (error) throw error;
    usuario = data.user;
  }
  const uid = usuario.id;

  await db.from("profiles").upsert({
    id: uid,
    email: EMAIL,
    full_name: NOMBRE,
    phone: TELEFONO,
    cedula: CEDULA,
    role: "client",
    is_provider: false,
    // Sin esto la cuenta cae en el onboarding cada vez que entra.
    onboarding_completed: true,
  }, { onConflict: "id" });

  // Que no exista un perfil profesional: la gracia de esta cuenta es no tenerlo.
  await db.from("professionals").delete().eq("profile_id", uid);

  // Uno por etapa, para que las tres pestañas de «Mis proyectos» —activas,
  // finalizadas y canceladas— tengan algo que mostrar sin tener que fabricarlo
  // a mano cada vez.
  const proyectos = [
    {
      id: idEstable("proyecto-abierto"),
      title: "Cambiar la llave de la cocina",
      description: "La llave del fregadero gotea y ya cambié el empaque. Necesito que la revisen y la cambien si hace falta.",
      category_id: "fontaneria",
      provincia_id: "sj",
      canton_id: "sj-sj",
      status: "open",
    },
    {
      id: idEstable("proyecto-abierto-2"),
      title: "Instalar dos cámaras en la entrada",
      description: "Dos cámaras en la entrada del garaje, con vista al portón. Ya hay toma de corriente cerca.",
      category_id: "camaras_seguridad",
      provincia_id: "al",
      canton_id: "al-al",
      status: "open",
    },
    {
      id: idEstable("proyecto-finalizado"),
      title: "Reparar el portón eléctrico",
      description: "El portón se queda a medio camino y hay que forzarlo. Necesito que lo revisen.",
      category_id: "electricidad",
      provincia_id: "he",
      canton_id: "he-he",
      status: "completed",
    },
    {
      id: idEstable("proyecto-cerrado"),
      title: "Pintar el cuarto principal",
      description: "Cuarto de 4x4, paredes y cielo raso. Ya tengo la pintura comprada.",
      category_id: "pintura",
      provincia_id: "sj",
      canton_id: "sj-sj",
      status: "cancelled",
    },
  ];
  // Esta cuenta es para probar, así que sus proyectos vuelven EXACTAMENTE al
  // estado sembrado: uno abierto y uno cancelado. Antes el upsert se mandaba sin
  // mirar el error y los estados quedaban como los hubiera dejado la última
  // prueba —todo «finalizado»—, así que resembrar no devolvía nada a su lugar.
  // Lo que quedó de pruebas anteriores se borra: esta cuenta existe para que la
  // lista sea siempre la misma, y al no borrarlo se acumulaban proyectos con el
  // mismo título prueba tras prueba.
  const idsSembrados = proyectos.map((p) => p.id);
  for (const proyecto of proyectos) {
    const { error } = await db.from("projects").upsert({
      ...proyecto,
      client_id: uid,
      client_name_snapshot: NOMBRE,
      client_email_snapshot: EMAIL,
      client_phone_snapshot: TELEFONO,
      client_identity_status: "verified",
      accepted_professional_id: null,
    }, { onConflict: "id" });
    if (error) throw new Error(`No se pudo sembrar "${proyecto.title}": ${error.message}`);
  }
  const { data: sobrantes } = await db
    .from("projects")
    .select("id,title")
    .eq("client_id", uid)
    .not("id", "in", `(${idsSembrados.join(",")})`);
  for (const sobrante of sobrantes ?? []) {
    await db.from("proposals").delete().eq("project_id", sobrante.id);
    await db.from("projects").delete().eq("id", sobrante.id);
  }

  // Un favorito de cada tipo, para ver los filtros con y sin contenido.
  const { data: oferta } = await db.from("professional_offers").select("id,title").eq("status", "published").limit(1).maybeSingle();
  const { data: empleo } = await db.from("job_posts").select("id,title").eq("status", "published").limit(1).maybeSingle();
  const guardados = [];
  if (oferta) guardados.push({ user_id: uid, item_type: "offer", item_id: oferta.id, snapshot: { title: oferta.title } });
  if (empleo) guardados.push({ user_id: uid, item_type: "job", item_id: empleo.id, snapshot: { title: empleo.title } });
  for (const guardado of guardados) {
    await db.from("saved_items").upsert(guardado, { onConflict: "user_id,item_type,item_id" });
  }

  // Una reseña dejada a la profesional de siempre, para ver «mis reseñas».
  await db.from("reviews").upsert({
    id: idEstable("resena"),
    professional_id: ACTORES.profesional.professionalId,
    client_id: uid,
    rating: 5,
    comment: "Llegó a la hora, dejó todo limpio y explicó qué había que cambiar. Lo vuelvo a llamar.",
    client_name_snapshot: NOMBRE,
    client_email_snapshot: EMAIL,
  }, { onConflict: "id" });

  console.log(`Cuenta de cliente lista: ${EMAIL} (${uid})`);
  console.log(`  proyectos: ${proyectos.length} · favoritos: ${guardados.length} · reseñas: 1`);
  if (sobrantes?.length) console.log(`  se borraron ${sobrantes.length} proyecto(s) que quedaron de pruebas anteriores`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
