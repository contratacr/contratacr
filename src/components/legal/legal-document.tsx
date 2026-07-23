import { getLocale } from "next-intl/server";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
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
  updated: string;
  intro: string;
  summary: string[];
  sections: LegalSection[];
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

export async function LegalDocument({ title, updated, intro, summary, sections, footer }: LegalDocumentProps) {
  const locale = await getLocale();
  const en = locale === "en";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />
      <main id="top" className="flex-1 pt-28 pb-20 px-4">
        <div className="mx-auto max-w-3xl">
          {en && (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-sm text-[#6b7280]">
              This English translation is provided for convenience. If there is any difference, the Spanish version prevails.
            </div>
          )}

          {/* Title */}
          <header className={locale === "en" ? "mt-6" : ""}>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111827]">{title}</h1>
            <p className="mt-2 text-[#6b7280]">{en ? "Last updated" : "Última actualización"}: {updated}</p>
          </header>

          {/* Intro */}
          <p className="mt-6 text-[#374151] leading-relaxed">{renderInline(intro, "intro")}</p>

          <section aria-labelledby="legal-summary" className="mt-8 rounded-xl border border-[#cfe6f1] bg-[#f4faff] p-5">
            <h2 id="legal-summary" className="text-base font-bold text-[#162543]">{en ? "Key points" : "Lo más importante"}</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#374151]">
              {summary.map((item, index) => (
                <li key={index} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" />
                  <span>{renderInline(item, `summary-${index}`)}</span>
                </li>
              ))}
            </ul>
          </section>

          <details className="group mt-6 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] open:pb-1 sm:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold text-[#162543]">
              {en ? "View contents" : "Ver contenido"}
              <span aria-hidden="true" className="text-lg font-normal text-[#708095] transition-transform group-open:rotate-45">+</span>
            </summary>
            <ol className="list-none border-t border-[#e5e7eb] px-4 py-3">
              {sections.map((s) => (
                <li key={s.id} className="mb-2 last:mb-0">
                  <a href={`#${s.id}`} className="text-sm leading-snug text-[#0089BB] hover:underline">{s.h}</a>
                </li>
              ))}
            </ol>
          </details>

          <nav aria-label={en ? "Contents" : "Contenido"} className="mt-6 hidden rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-5 sm:block">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#9ca3af]">{en ? "Contents" : "Contenido"}</p>
            <ol className="list-none columns-1 sm:columns-2 gap-x-6">
              {sections.map((s) => (
                <li key={s.id} className="mb-2 break-inside-avoid">
                  <a href={`#${s.id}`} className="text-sm leading-snug text-[#009FD9] hover:underline">{s.h}</a>
                </li>
              ))}
            </ol>
          </nav>

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

            <a href="#top" className="mx-auto text-sm font-semibold text-[#0089BB] hover:underline">
              {en ? "Back to top" : "Volver arriba"}
            </a>

            <p className="text-center text-sm italic text-[#9ca3af]">
              ContrataCR - {en ? "Find and hire professionals in Costa Rica." : "Encuentra y contrata profesionales en Costa Rica."}
            </p>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
