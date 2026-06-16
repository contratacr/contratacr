import { getLocale } from "next-intl/server";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";

// ── Content model ──────────────────────────────────────────────────────────
// Legal text is stored as data (verbatim Spanish) and rendered consistently.
// Inline emphasis uses **bold**; the support email is auto-linked.
export type LegalBlock =
  | { k: "p"; text: string }
  | { k: "sub"; text: string }
  | { k: "ul"; items: string[] }
  | { k: "note"; text: string };

export type LegalSection = { id: string; h: string; body: LegalBlock[] };

export interface LegalDocumentProps {
  title: string;
  /** e.g. "14 de junio de 2026" (optionally with a suffix like "· Ley 8968"). */
  updated: string;
  intro: string;
  sections: LegalSection[];
  /** The "see also" line at the foot, e.g. the cross-link to the other document. */
  footer: React.ReactNode;
}

// Render a run of text: **bold** segments + the support email as a mailto link.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="font-semibold text-[#111827]">{linkifyEmail(part.slice(2, -2), key)}</strong>;
    }
    return <span key={key}>{linkifyEmail(part, key)}</span>;
  });
}

function linkifyEmail(text: string, keyBase: string): React.ReactNode {
  if (!text.includes(SUPPORT_EMAIL)) return text;
  const segs = text.split(SUPPORT_EMAIL);
  return segs.flatMap((s, i) =>
    i === 0
      ? [s]
      : [
          <a key={`${keyBase}-m${i}`} href={`mailto:${SUPPORT_EMAIL}`} className="text-[#009FD9] hover:underline">{SUPPORT_EMAIL}</a>,
          s,
        ]
  );
}

export async function LegalDocument({ title, updated, intro, sections, footer }: LegalDocumentProps) {
  const locale = await getLocale();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />
      <main className="flex-1 pt-28 pb-20 px-4">
        <div className="mx-auto max-w-3xl">
          {/* Spanish-only notice for EN visitors — the legal version is in Spanish. */}
          {locale === "en" && (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-sm text-[#6b7280]">
              This document is the binding legal version and is available only in Spanish.
            </div>
          )}

          {/* Title */}
          <header className={locale === "en" ? "mt-6" : ""}>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111827]">{title}</h1>
            <p className="text-[#6b7280] mt-2">Última actualización: {updated}</p>
          </header>

          {/* Intro */}
          <p className="mt-6 text-[#374151] leading-relaxed">{renderInline(intro, "intro")}</p>

          {/* Table of contents — a balanced 2-column FLOW (CSS multi-columns), NOT a grid.
              A grid couples each row's height, so a long item that wraps to two lines stretched
              its row and left an empty gap below the short item paired with it. With multi-columns
              each item takes only its own height and the spacing stays even, even when an item
              wraps. `list-none` (the "N." prefix is already in the text); `break-inside-avoid`
              keeps a link from splitting across the column break. */}
          <nav aria-label="Contenido" className="mt-8 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[#9ca3af] mb-3">Contenido</p>
            <ol className="list-none columns-1 sm:columns-2 gap-x-6">
              {sections.map((s) => (
                <li key={s.id} className="mb-2 break-inside-avoid">
                  <a href={`#${s.id}`} className="text-sm leading-snug text-[#009FD9] hover:underline">{s.h}</a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Sections */}
          <div className="mt-10 flex flex-col gap-10">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-xl font-bold text-[#111827] mb-3">{s.h}</h2>
                <div className="space-y-3 text-[#374151] leading-relaxed">
                  {s.body.map((b, i) => {
                    const key = `${s.id}-${i}`;
                    if (b.k === "p") return <p key={key}>{renderInline(b.text, key)}</p>;
                    if (b.k === "sub") return <h3 key={key} className="text-base font-semibold text-[#111827] pt-1">{renderInline(b.text, key)}</h3>;
                    if (b.k === "note")
                      return (
                        <p key={key} className="rounded-xl border-l-4 border-[#009FD9] bg-[#EBF5FB] px-4 py-3 text-[#374151]">
                          {renderInline(b.text, key)}
                        </p>
                      );
                    return (
                      <ul key={key} className="list-disc pl-5 space-y-1.5 marker:text-[#9ca3af]">
                        {b.items.map((it, j) => <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>)}
                      </ul>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-5 text-sm text-[#6b7280]">
              {footer}
            </div>

            <p className="text-center text-sm italic text-[#9ca3af]">
              ContrataCR — Encuentra y contrata profesionales en Costa Rica.
            </p>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
