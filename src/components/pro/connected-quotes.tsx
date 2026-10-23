"use client";
import { proMoney } from "@/lib/pro/money";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ReceiptText, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import {
  PanelListSkeleton,
  PanelEmptyState,
} from "@/components/ui/content-loading";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { QuoteEditorModal } from "@/components/quotes/quote-editor-modal";
import { QuoteDetailModal } from "@/components/quotes/quote-detail-modal";
import { businessSchema, quoteTotal, type Business } from "@/lib/pro/business";
import type { Quote } from "@/lib/quotes";
import { ProWorkspace } from "./pro-workspace";
export function ConnectedQuotes({
  proName,
  proSlug,
  puedeCrear = true,
}: {
  proName: string;
  proSlug?: string | null;
  puedeCrear?: boolean;
}) {
  const locale = useLocale(),
    en = locale === "en",
    params = useSearchParams();
  const tr = (es: string, eng: string) => (en ? eng : es);
  const [data, setData] = useState<Business | null>(null),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [error, setError] = useState("");
  const [editor, setEditor] = useState(params.get("nueva") === "1"),
    [detail, setDetail] = useState<string | null>(params.get("cotizacion"));
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(20);
  const sentinel = useRef<HTMLDivElement>(null);
  const load = () =>
    Promise.all([fetch("/api/pro/workspace"), fetch("/api/quotes")])
      .then(async ([workspace, response]) => {
        if (!workspace.ok || !response.ok)
          throw Error(
            tr(
              "No se pudieron cargar las cotizaciones.",
              "Could not load quotes.",
            ),
          );
        const [w, r] = await Promise.all([workspace.json(), response.json()]);
        setData(businessSchema.parse(w.document));
        setQuotes(r.quotes || []);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) setLimit((v) => v + 20);
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, data, search, filter]);
  const status = (s: string) =>
    ({
      accepted: tr("Aceptada", "Accepted"),
      declined: tr("Rechazada", "Declined"),
      sent: tr("Enviada", "Sent"),
      draft: tr("Borrador", "Draft"),
      withdrawn: tr("Retirada", "Withdrawn"),
    })[s] || s;
  const rows = [
    ...quotes
      .filter((q) => !q.deleted_at)
      .map((q) => ({
        id: q.id,
        title: q.title || "",
        client: q.client_name || "",
        total: q.total,
        status: q.status,
        at: q.created_at,
        legacy: false,
      })),
    ...(data?.quotes || []).map((q) => ({
      id: q.id,
      title: q.title,
      client: data!.clients.find((c) => c.id === q.clientId)?.name || "",
      total: quoteTotal(q.lines),
      status: q.status,
      at: "",
      legacy: true,
    })),
  ]
    .filter(
      (q) =>
        (filter === "all" || q.status === filter) &&
        `${q.client} ${q.title}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || a.title.localeCompare(b.title));
  const quote = quotes.find((q) => q.id === detail),
    old = data?.quotes.find((q) => q.id === detail);
  const link = data?.quoteLinks.find((l) => l.quoteId === detail);
  const schedule = (clientId: string, id: string, legacy = false) =>
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}?${new URLSearchParams({ tab: "pro_agenda", nueva: "1", cliente: clientId, [legacy ? "anterior" : "cotizacion"]: id })}`,
    );
  const money = proMoney;
  return (
    <div className="space-y-4">
      <SectionHeadline
        subtitulo={tr(
          "Sus cotizaciones, clientes y próximos trabajos.",
          "Your quotes, customers and next jobs.",
        )}
      >
        <Button
          size="crear"
          className="w-full sm:w-auto"
          onClick={() => setEditor(true)}
          disabled={!data || !puedeCrear}
        >
          <Plus className="h-4 w-4" />
          {tr("Nueva cotización", "New quote")}
        </Button>
      </SectionHeadline>
      {error && (
        <p role="alert">
          {error}
          <Button variant="secondary" onClick={() => void load()}>
            {tr("Reintentar", "Retry")}
          </Button>
        </p>
      )}
      {!data && !error ? (
        <PanelListSkeleton rows={3} compacto />
      ) : (
        <>
          <input
            aria-label={tr("Buscar cotizaciones", "Search quotes")}
            placeholder={tr(
              "Buscar cliente o cotización",
              "Search customer or quote",
            )}
            className="min-h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-[15px]"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(20);
            }}
          />
          <StatusFilterTabs
            tabs={["all", "draft", "sent", "accepted", "declined"].map(
              (id) => ({ id }),
            )}
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setLimit(20);
            }}
            labelFor={(id) => (id === "all" ? tr("Todas", "All") : status(id))}
            variant="pills"
            limpiable={false}
          />
          {!rows.length ? (
            <PanelEmptyState
              icon={ReceiptText}
              title={tr(
                "No hay cotizaciones en esta vista",
                "No quotes in this view",
              )}
              description={tr(
                "Cree una cotización o cambie los filtros.",
                "Create a quote or change your filters.",
              )}
            />
          ) : (
            rows.slice(0, limit).map((q) => (
              <button
                key={q.id}
                onClick={() => setDetail(q.id)}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left hover:border-[#bfe3f5]"
              >
                <span className="ccr-caja-icono-plana grid h-11 w-11 shrink-0 place-items-center rounded-[14px]">
                  <ReceiptText className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <h2 className="break-words text-[15px] font-extrabold text-[#162543]">
                    {q.client || q.title}
                  </h2>
                  {q.client && (
                    <span className="block break-words text-[13px] text-[#52627a]">
                      {q.title}
                    </span>
                  )}
                  <span className="text-xs text-[#68778d]">
                    {status(q.status)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold">
                  {money(q.total)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8ba]" />
              </button>
            ))
          )}
          {limit < rows.length && (
            <div ref={sentinel}>
              <Button
                variant="secondary"
                onClick={() => setLimit((v) => v + 20)}
              >
                {tr("Ver más", "Show more")}
              </Button>
            </div>
          )}
        </>
      )}
      {editor && data && (
        <QuoteEditorModal
          open
          proData={data}
          initialProClientId={params.get("cliente") || undefined}
          onClose={() => setEditor(false)}
          onSent={(q) => {
            setQuotes((prev) => [q, ...prev]);
            setEditor(false);
            setDetail(q.id);
            void load();
          }}
        />
      )}
      {quote && (
        <QuoteDetailModal
          open
          quote={quote}
          role="pro"
          proName={proName}
          proSlug={proSlug}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            void load();
          }}
          proActions={
            link && quote.status === "accepted" ? (
              <Button onClick={() => schedule(link.clientId, quote.id)}>
                {tr("Agendar cita", "Schedule appointment")}
              </Button>
            ) : undefined
          }
        />
      )}
      {old && (
        <Modal
          title={old.title}
          closeLabel={tr("Cerrar", "Close")}
          onClose={() => {
            setDetail(null);
            void load();
          }}
          mobilePresentation="fullscreen"
          footer={
            old.status === "accepted" ? (
              <Button onClick={() => schedule(old.clientId, old.id, true)}>
                {tr("Agendar cita", "Schedule appointment")}
              </Button>
            ) : undefined
          }
        >
          <ProWorkspace
            server
            embedded
            section="Cotizaciones"
            quoteListOnly
            onlyQuoteId={old.id}
            english={en}
          />
        </Modal>
      )}
    </div>
  );
}
