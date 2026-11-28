import type { Metadata } from "next";
import { notFound, redirect, RedirectType } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DirectoryShell } from "@/components/directory/directory-shell";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { PRO_ENABLED } from "@/lib/pro/enabled";
import { TOOLS_ROW, TOOLS_ROW_ICON, TOOLS_TITLE, isToolsGroupId, toolsCatalog } from "@/lib/pro/tools-catalog";

// Herramientas (owner, 2026-11-26): five groups by what the person wants to do (not by how the panel is built); a group
// opens its list of tools with the Pro panel's names. Pro-only page: 404 while PRO_ENABLED is off (production).
// Owner, 2026-11-27: signed in, Herramientas is a section of «Mi panel» (?tab=tools[&grupo=]): this page redirects there
// (replace). Signed out, it stays public and explains the tools; the middleware sends a tool to login with ?redirect=.
// A group screen has no second header: the phone bar itself reads «← <group>» (server-painted) and goes back to the list.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${locale === "en" ? TOOLS_TITLE.en : TOOLS_TITLE.es} | ContrataCR`, robots: { index: false, follow: false } };
}

export default async function ToolsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ grupo?: string }> }) {
  if (!PRO_ENABLED) notFound();
  const [{ locale }, { grupo }] = await Promise.all([params, searchParams]);
  const en = locale === "en";
  const prefix = en ? "/en" : "";
  const grupoValido = isToolsGroupId(grupo) ? grupo : null;
  const user = await safeGetUser(await createClient());
  if (user) redirect(`${prefix}/dashboard/profesional?tab=tools${grupoValido ? `&grupo=${grupoValido}` : ""}`, RedirectType.replace);
  const title = en ? TOOLS_TITLE.en : TOOLS_TITLE.es;
  const groups = toolsCatalog(en);
  const open = groups.find((g) => g.id === grupoValido) ?? null;
  return (
    <DirectoryShell section={open ? { title: open.label } : undefined}>
      {open ? <SectionHeaderTitle title={open.label} fallbackHref="/herramientas" tambienEnLaWeb /> : <SectionHeaderTitle title={title} raiz tambienEnLaWeb />}
      <main id="contenido" className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <h1 className="sr-only">{open ? open.label : title}</h1>
        {open ? (
          <section data-tools-group={open.id}>
            {/* Desktop only: on phones the bar is «← group» and already goes back. */}
            <Link href="/herramientas" prefetch={false} data-tools-back className="mb-3 hidden items-center gap-1.5 text-[15px] font-bold text-[#0083b0] lg:inline-flex">
              <ArrowLeft className="h-4 w-4" aria-hidden />{title}
            </Link>
            <h2 data-tools-group-heading className="mb-3 hidden text-[20px] font-extrabold text-[#162543] lg:block">{open.label}</h2>
            <ul className="space-y-2">
              {open.tools.map(({ key, label, href, icon: Icon }) => (
                <li key={key}>
                  <Link href={href} prefetch={false} data-tools-entry={key} className={TOOLS_ROW}>
                    <span className={TOOLS_ROW_ICON}><Icon aria-hidden /></span>
                    <span className="min-w-0 flex-1 break-words">{label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <ul className="space-y-2">
            {groups.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <Link href={`/herramientas?grupo=${id}`} prefetch={false} data-tools-group-tile={id} className={TOOLS_ROW}>
                  <span className={TOOLS_ROW_ICON}><Icon aria-hidden /></span>
                  <span className="min-w-0 flex-1 break-words">{label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </DirectoryShell>
  );
}
