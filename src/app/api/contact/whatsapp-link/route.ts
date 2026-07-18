import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppLink } from "@/lib/utils";
import { limitTrimmedText } from "@/lib/text-limits";

type ProfessionalContact = {
  id: string;
  profile_id: string;
  whatsapp?: string | null;
  business_name?: string | null;
  profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null;
};

type ClientProfile = { full_name?: string | null; phone?: string | null };
type BookingContactRow = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  professional_id?: string | null;
  service_description?: string | null;
  professionals?: ProfessionalContact | ProfessionalContact[] | null;
};
type ProjectContactRow = {
  id: string;
  client_id?: string | null;
  title?: string | null;
  profiles?: ClientProfile | ClientProfile[] | null;
};
type ProposalContactRow = {
  id: string;
  professional_id?: string | null;
  project_id?: string | null;
  professionals?: ProfessionalContact | ProfessionalContact[] | null;
  projects?: ProjectContactRow | ProjectContactRow[] | null;
};

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function profileName(row: ProfessionalContact | null | undefined) {
  const profile = firstRelated(row?.profiles);
  return row?.business_name || profile?.full_name || null;
}

function defaultMessage(locale: string, recipientName?: string | null, contextTitle?: string | null) {
  const name = recipientName?.trim();
  const context = contextTitle?.trim();
  if (locale === "en") {
    return context
      ? `Hello${name ? ` ${name}` : ""}, I saw your information on ContrataCR and would like to coordinate about "${context}".`
      : `Hello${name ? ` ${name}` : ""}, I saw your profile on ContrataCR and would like to coordinate a service.`;
  }
  return context
    ? `Hola${name ? ` ${name}` : ""}, vi tu informacion en ContrataCR y quisiera coordinar sobre "${context}".`
    : `Hola${name ? ` ${name}` : ""}, vi tu perfil en ContrataCR y quisiera coordinar un servicio.`;
}

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const professionalId = String(body.professionalId ?? "");
  const bookingId = String(body.bookingId ?? "");
  const proposalId = String(body.proposalId ?? "");
  const locale = String(body.locale ?? "es") === "en" ? "en" : "es";
  const contextTitle = limitTrimmedText(body.contextTitle, 160);
  const initialMessage = limitTrimmedText(body.initialMessage, 700);
  const userId = await currentUserId();
  const db = createAdminClient();

  let phone: string | null = null;
  let recipientName: string | null = null;

  if (bookingId) {
    const { data: booking, error } = await db
      .from("bookings")
      .select("id, client_id, client_name, client_phone, professional_id, service_description, professionals(id, profile_id, whatsapp, business_name, profiles(full_name))")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const bookingRow = booking as BookingContactRow | null;
    const professional = firstRelated(bookingRow?.professionals);
    if (!booking || !professional) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });

    if (userId && userId === professional.profile_id) {
      phone = bookingRow?.client_phone ?? null;
      recipientName = bookingRow?.client_name ?? null;
    } else {
      phone = professional.whatsapp ?? null;
      recipientName = profileName(professional);
    }
  } else if (proposalId) {
    const { data: proposal, error } = await db
      .from("proposals")
      .select("id, professional_id, project_id, professionals(id, profile_id, whatsapp, business_name, profiles(full_name)), projects(id, client_id, title, profiles:client_id(full_name, phone))")
      .eq("id", proposalId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const proposalRow = proposal as ProposalContactRow | null;
    const professional = firstRelated(proposalRow?.professionals);
    const project = firstRelated(proposalRow?.projects);
    const clientProfile = firstRelated(project?.profiles);
    if (!proposal || !professional || !project) return NextResponse.json({ error: "Propuesta no encontrada." }, { status: 404 });

    if (userId && userId === professional.profile_id) {
      phone = clientProfile?.phone ?? null;
      recipientName = clientProfile?.full_name ?? null;
    } else {
      phone = professional.whatsapp ?? null;
      recipientName = profileName(professional);
    }
  } else if (professionalId) {
    const { data: professional, error } = await db
      .from("professionals")
      .select("id, profile_id, whatsapp, business_name, profiles(full_name)")
      .eq("id", professionalId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!professional) return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });

    const professionalRow = professional as ProfessionalContact;
    phone = professionalRow.whatsapp ?? null;
    recipientName = profileName(professionalRow);
  }

  if (!phone) {
    return NextResponse.json({ error: locale === "en" ? "No WhatsApp number is available." : "No hay un numero de WhatsApp disponible." }, { status: 404 });
  }

  const message = initialMessage || defaultMessage(locale, recipientName, contextTitle);
  return NextResponse.json({ href: getWhatsAppLink(phone, message) });
}
