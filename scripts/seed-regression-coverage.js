/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const TEST_PROJECT_REF = "sodegkfjjrdkbohycqyq";
const SEED = "production-mirror-regression-coverage-v1";
const envFile = process.env.DEMO_ENV_FILE || ".env.test";

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let projectRef = "invalid";
try { projectRef = new URL(url).hostname.split(".")[0]; } catch {}
if (projectRef !== TEST_PROJECT_REF || !serviceRole) {
  throw new Error("Regression coverage seed only runs against the test Supabase project.");
}

const db = createClient(url, serviceRole, { auth: { persistSession: false } });
const actors = {
  contratacr: {
    profileId: "048f1b3a-23c0-41bc-8728-10f8aed70fdb",
    professionalId: "ae9caa2b-1fca-4411-9aeb-7736f5bbf42f",
    email: "e2e.client@contratacr.test",
    phone: "+506 7000 0001",
    name: "ContrataCR",
  },
  sg: {
    profileId: "347f5202-8b3e-4c11-8db8-1060ea5e487d",
    professionalId: "988428c7-a0b6-4d9e-a9b8-e0209a1ca296",
    email: "e2e.pro@contratacr.test",
    phone: "+506 7000 0002",
    name: "SG Solutions",
  },
};

const ids = {
  bookings: Array.from({ length: 6 }, (_, index) => `d1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  projects: Array.from({ length: 6 }, (_, index) => `d2000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  opportunities: Array.from({ length: 40 }, (_, index) => `d2100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  proposals: Array.from({ length: 6 }, (_, index) => `d3000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  jobs: Array.from({ length: 8 }, (_, index) => `d4000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  applications: Array.from({ length: 6 }, (_, index) => `d5000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  offers: Array.from({ length: 10 }, (_, index) => `d6000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  tickets: Array.from({ length: 6 }, (_, index) => `d7000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  ticketMessages: Array.from({ length: 6 }, (_, index) => `d8000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  notifications: Array.from({ length: 6 }, (_, index) => `d9000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (days = 0) => new Date(now + days * DAY).toISOString();
const date = (days = 0) => iso(days).slice(0, 10);

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function professional(id, label) {
  const row = await must(label, db.from("professionals").select("id,profile_id,category_id,professions,provincia_id,canton_id,portfolio_urls").eq("id", id).single());
  return row;
}

function professionIds(pro) {
  return [...new Set([...(Array.isArray(pro.professions) ? pro.professions : []), pro.category_id])]
    .filter((id) => id && id !== "otro");
}

function booking(id, client, pro, status, offset, suffix) {
  const scheduled = status === "completed" ? -Math.abs(offset) : Math.abs(offset);
  return {
    id,
    professional_id: pro.id,
    client_id: client.profileId,
    category_id: pro.category_id,
    service_description: `${suffix}: cobertura del filtro ${status}.`,
    preferred_date: date(scheduled),
    preferred_date_text: status === "completed" ? "Fecha anterior" : "Próxima fecha disponible",
    scheduled_date: date(scheduled),
    scheduled_time: `${String(8 + offset).padStart(2, "0")}:00`,
    status,
    client_name: client.name,
    client_email: client.email,
    client_phone: client.phone,
    notes: `Dato ${SEED} entre ${client.name} y ${pro.id === actors.sg.professionalId ? actors.sg.name : actors.contratacr.name}.`,
    cancelled_by: status === "cancelled" ? "client" : null,
    cancel_reason: status === "cancelled" ? "Cancelación de regresión para validar el filtro." : null,
    work_done_at: status === "completed" ? iso(-Math.abs(offset)) : null,
    completed_at: status === "completed" ? iso(-Math.abs(offset)) : null,
    created_at: iso(-10 - offset),
    updated_at: iso(-offset),
    created_app_environment: SEED,
    created_source_host: "test.contratacr.com",
    created_supabase_project_ref: TEST_PROJECT_REF,
  };
}

function project(id, client, targetPro, status, index) {
  return {
    id,
    client_id: client.profileId,
    category_id: targetPro.category_id,
    title: `${client.name}: proyecto ${status}`,
    description: `Proyecto determinista para validar el filtro ${status} entre SG Solutions y ContrataCR.`,
    provincia_id: targetPro.provincia_id,
    canton_id: targetPro.canton_id,
    budget_min: 100000 + index * 25000,
    budget_max: 250000 + index * 50000,
    timeline: "Durante este mes",
    status,
    accepted_professional_id: status === "open" ? null : targetPro.id,
    client_name_snapshot: client.name,
    client_email_snapshot: client.email,
    client_phone_snapshot: client.phone,
    created_at: iso(-12 + index),
    updated_at: iso(-index),
    created_app_environment: SEED,
    created_source_host: "test.contratacr.com",
    created_supabase_project_ref: TEST_PROJECT_REF,
  };
}

function opportunity(id, client, targetPro, categoryId, index) {
  return {
    id,
    client_id: client.profileId,
    category_id: categoryId,
    title: `${client.name}: oportunidad ${index + 1}`,
    description: `Oportunidad abierta sin propuesta previa para validar el filtro profesional ${categoryId}.`,
    provincia_id: targetPro.provincia_id,
    canton_id: targetPro.canton_id,
    budget_min: 125000 + index * 10000,
    budget_max: 275000 + index * 15000,
    timeline: "Durante este mes",
    status: "open",
    accepted_professional_id: null,
    client_name_snapshot: client.name,
    client_email_snapshot: client.email,
    client_phone_snapshot: client.phone,
    created_at: iso(-1 - index / 100),
    updated_at: iso(-index / 100),
    created_app_environment: SEED,
    created_source_host: "test.contratacr.com",
    created_supabase_project_ref: TEST_PROJECT_REF,
  };
}

function job(id, owner, categoryId, status, index) {
  return {
    id,
    employer_id: owner.professionalId,
    title: `${owner.name}: empleo ${status}`,
    description: `Vacante de regresión para validar el estado ${status}.`,
    responsibilities: ["Validar el flujo completo", "Documentar resultados"],
    requirements: ["Comunicación clara"],
    benefits: ["Horario flexible"],
    employment_type: index % 2 ? "contract" : "full_time",
    workplace_type: index % 3 === 0 ? "remote" : "hybrid",
    location_label: index % 3 === 0 ? "Todo Costa Rica" : "Atenas, Alajuela",
    salary_min: 450000,
    salary_max: 700000,
    salary_period: "monthly",
    currency: "CRC",
    show_salary: true,
    openings: 1,
    application_deadline: date(30),
    status,
    service_category_id: categoryId,
    experience_level: "one_plus",
    created_at: iso(-index - 2),
    updated_at: iso(-1),
  };
}

function offer(id, owner, categoryId, status, index, image) {
  return {
    id,
    professional_id: owner.professionalId,
    title: `${owner.name}: oferta ${status}`,
    description: `Oferta determinista para validar el estado ${status}.`,
    offer_type: index % 2 ? "product" : "service_offer",
    service_label: owner.name === "ContrataCR" ? "Desarrollo web" : "Redes e internet",
    image_urls: image ? [image] : [],
    price_now: 75000 + index * 10000,
    price_before: 100000 + index * 10000,
    currency: "CRC",
    price_unit: "project",
    location_label: index % 2 ? "Atenas, Alajuela" : "Todo Costa Rica",
    valid_until: status === "expired" ? date(-2) : date(30),
    quantity_available: status === "sold_out" ? 0 : 4,
    status,
    service_category_id: categoryId,
    created_at: iso(-index - 2),
    updated_at: iso(-1),
  };
}

async function main() {
  const [contrataPro, sgPro] = await Promise.all([
    professional(actors.contratacr.professionalId, "ContrataCR professional"),
    professional(actors.sg.professionalId, "SG Solutions professional"),
  ]);

  const bookings = [
    booking(ids.bookings[0], actors.contratacr, sgPro, "confirmed", 2, "Solicitud activa a SG Solutions"),
    booking(ids.bookings[1], actors.contratacr, sgPro, "completed", 3, "Solicitud finalizada a SG Solutions"),
    booking(ids.bookings[2], actors.contratacr, sgPro, "cancelled", 4, "Solicitud cancelada a SG Solutions"),
    booking(ids.bookings[3], actors.sg, contrataPro, "in_progress", 5, "Solicitud activa a ContrataCR"),
    booking(ids.bookings[4], actors.sg, contrataPro, "completed", 6, "Solicitud finalizada a ContrataCR"),
    booking(ids.bookings[5], actors.sg, contrataPro, "cancelled", 7, "Solicitud cancelada a ContrataCR"),
  ];
  await must("coverage bookings", db.from("bookings").upsert(bookings, { onConflict: "id" }));

  const projects = [
    project(ids.projects[0], actors.contratacr, sgPro, "open", 0),
    project(ids.projects[1], actors.contratacr, sgPro, "completed", 1),
    project(ids.projects[2], actors.contratacr, sgPro, "cancelled", 2),
    project(ids.projects[3], actors.sg, contrataPro, "in_progress", 3),
    project(ids.projects[4], actors.sg, contrataPro, "completed", 4),
    project(ids.projects[5], actors.sg, contrataPro, "cancelled", 5),
  ];
  await must("coverage projects", db.from("projects").upsert(projects, { onConflict: "id" }));

  const opportunityTargets = [
    { client: actors.sg, pro: contrataPro },
    { client: actors.contratacr, pro: sgPro },
  ];
  const opportunities = opportunityTargets.flatMap(({ client, pro }) =>
    professionIds(pro).map((categoryId) => ({ client, pro, categoryId })),
  ).map(({ client, pro, categoryId }, index) =>
    opportunity(ids.opportunities[index], client, pro, categoryId, index),
  );
  if (opportunities.length > ids.opportunities.length) {
    throw new Error(`Opportunity seed needs ${opportunities.length} deterministic ids.`);
  }
  await must("coverage open opportunities", db.from("projects").upsert(opportunities, { onConflict: "id" }));

  const proposalStatuses = ["pending", "accepted", "declined", "accepted", "accepted", "declined"];
  const proposals = projects.map((item, index) => {
    const pro = index < 3 ? sgPro : contrataPro;
    const owner = index < 3 ? actors.sg : actors.contratacr;
    return {
      id: ids.proposals[index],
      project_id: item.id,
      professional_id: pro.id,
      price: 150000 + index * 25000,
      message: `Propuesta ${proposalStatuses[index]} para validar todos los filtros.`,
      status: proposalStatuses[index],
      professional_user_id_snapshot: owner.profileId,
      professional_name_snapshot: owner.name,
      professional_email_snapshot: owner.email,
      created_at: iso(-8 + index),
      created_app_environment: SEED,
      created_source_host: "test.contratacr.com",
      created_supabase_project_ref: TEST_PROJECT_REF,
    };
  });
  await must("coverage proposals", db.from("proposals").upsert(proposals, { onConflict: "id" }));

  const jobStatuses = ["published", "paused", "closed", "draft"];
  const jobs = [
    ...jobStatuses.map((status, index) => job(ids.jobs[index], actors.contratacr, contrataPro.category_id, status, index)),
    ...jobStatuses.map((status, index) => job(ids.jobs[index + 4], actors.sg, sgPro.category_id, status, index + 4)),
  ];
  await must("coverage jobs", db.from("job_posts").upsert(jobs, { onConflict: "id" }));

  const applicationStatuses = ["submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"];
  const applications = applicationStatuses.map((status, index) => {
    const applicant = index % 2 === 0 ? actors.sg : actors.contratacr;
    const targetJob = index % 2 === 0
      ? jobs[Math.floor(index / 2)]
      : jobs[4 + Math.floor(index / 2)];
    return {
      id: ids.applications[index],
      job_id: targetJob.id,
      applicant_id: applicant.profileId,
      cover_letter: `Postulación ${status} entre SG Solutions y ContrataCR.`,
      phone: applicant.phone,
      applicant_email: applicant.email,
      portfolio_url: "https://contratacr.com",
      status,
      created_at: iso(-7 + index),
      updated_at: iso(-1),
    };
  });
  await must("coverage applications", db.from("job_applications").upsert(applications, { onConflict: "id" }));

  const offerStatuses = ["published", "paused", "expired", "sold_out", "draft"];
  const offers = [
    ...offerStatuses.map((status, index) => offer(ids.offers[index], actors.contratacr, contrataPro.category_id, status, index, contrataPro.portfolio_urls?.[0])),
    ...offerStatuses.map((status, index) => offer(ids.offers[index + 5], actors.sg, sgPro.category_id, status, index + 5, sgPro.portfolio_urls?.[0])),
  ];
  await must("coverage offers", db.from("professional_offers").upsert(offers, { onConflict: "id" }));

  const ticketStatuses = ["open", "in_progress", "resolved"];
  const tickets = [actors.contratacr, actors.sg].flatMap((owner, ownerIndex) => ticketStatuses.map((status, statusIndex) => {
    const index = ownerIndex * 3 + statusIndex;
    return {
      id: ids.tickets[index],
      professional_id: owner.professionalId,
      user_id: owner.profileId,
      name: owner.name,
      email: owner.email,
      type: "support",
      topic: statusIndex === 0 ? "technical" : statusIndex === 1 ? "profile" : "account",
      subject: `${owner.name}: soporte ${status}`,
      detail: `Cobertura del filtro ${status}.`,
      message: `Mensaje inicial del ticket ${status}.`,
      status,
      user_confirmed: status === "resolved",
      created_at: iso(-index - 3),
      last_reply_at: iso(-1),
      last_reply_role: status === "open" ? "user" : "admin",
      resolved_at: status === "resolved" ? iso(-1) : null,
      created_app_environment: SEED,
      created_source_host: "test.contratacr.com",
      created_supabase_project_ref: TEST_PROJECT_REF,
    };
  }));
  await must("coverage tickets", db.from("support_tickets").upsert(tickets, { onConflict: "id" }));
  await must("coverage ticket messages", db.from("support_ticket_messages").upsert(tickets.map((ticket, index) => ({
    id: ids.ticketMessages[index],
    ticket_id: ticket.id,
    sender_role: "user",
    sender_id: ticket.user_id,
    sender_name: ticket.name,
    body: ticket.message,
    created_at: ticket.created_at,
  })), { onConflict: "id" }));

  const notificationTypes = ["booking_received", "booking_completed", "proposal_received", "job_application_status", "support_reply", "direct_message"];
  await must("coverage notifications", db.from("notifications").upsert(notificationTypes.map((type, index) => {
    const owner = index % 2 ? actors.sg : actors.contratacr;
    return {
      id: ids.notifications[index],
      user_id: owner.profileId,
      type,
      title: `${owner.name}: notificación ${type}`,
      message: `Notificación enlazada para regresión de ${type}.`,
      data: { regressionSeed: SEED, link: "/dashboard/profesional?tab=notifications" },
      read: index >= 3,
      created_at: iso(-index),
    };
  }), { onConflict: "id" }));

  console.log(JSON.stringify({
    seed: SEED,
    bookings: bookings.length,
    projects: projects.length,
    opportunities: opportunities.length,
    proposals: proposals.length,
    jobs: jobs.length,
    applications: applications.length,
    offers: offers.length,
    supportTickets: tickets.length,
    notifications: notificationTypes.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
