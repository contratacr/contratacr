"use client";
import { AgendaCalendar } from "./agenda-calendar";
import { proMoney } from "@/lib/pro/money";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import {
  PanelEmptyState,
  PanelListSkeleton,
} from "@/components/ui/content-loading";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import {
  CardActionsMenu,
  type CardAction,
} from "@/components/dashboard/card-actions-menu";
import {
  saveClient,
  saveProduct,
  saveAppointment,
  moveStock,
  costaRicaDate,
  type Business,
} from "@/lib/pro/business";
import type { Quote } from "@/lib/quotes";
import { exportWork } from "@/lib/pro/workspace";
import { SocialPanel } from "./social-panel";
import { businessCsv, downloadFile } from "./exports";
const field =
  "mt-1 block min-h-11 w-full min-w-0 max-w-full box-border rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px] text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#009FD9]";
type Section = "Agenda" | "Clientes" | "Inventario" | "Redes";
export function BusinessPanel({
  accountId,
  section,
  data,
  ready,
  error,
  saving,
  commit,
  reload,
}: {
  accountId: string;
  section: Section;
  data: Business;
  ready: boolean;
  error: string;
  saving: boolean;
  commit: (data: Business) => Promise<boolean>;
  reload: () => void;
}) {
  const locale = useLocale(),
    en = locale === "en";
  const tr = (es: string, english: string) => (en ? english : es);
  const params = useSearchParams();
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [stock, setStock] = useState<string | null>(null);
  const submitLock = useRef(false);
  const [service, setService] = useState("");
  const [legacyQuote, setLegacyQuote] = useState(params.get("anterior") || "");
  const [exportError, setExportError] = useState("");
  const [phone, setPhone] = useState(""),
    [clientId, setClientId] = useState(params.get("cliente") || ""),
    [selectedQuote, setSelectedQuote] = useState(
      params.get("cotizacion") || "",
    );
  const [formError, setFormError] = useState(""),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [quoteError, setQuoteError] = useState("");
  const [week, setWeek] = useState(""),
    [visible, setVisible] = useState(20);
  const sentinel = useRef<HTMLDivElement>(null);
  const [view, setView] = useState("list");
  const [calendarDay,setCalendarDay]=useState("");
  const latestReload=useRef(reload);
  useEffect(()=>{latestReload.current=reload;},[reload]);
  useEffect(()=>{
    if(section!=="Agenda")return;
    const refresh=()=>{if(document.visibilityState==="visible"&&!saving&&!editing)latestReload.current();};
    const timer=window.setInterval(refresh,30000);
    window.addEventListener("focus",refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[section,saving,editing]);
  const key = `ccr:pro:form:${accountId}:${section}`;
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!accountId) return;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || "{}");
      setDraft(value);
      if (value._editing) {
        setEditing(value._editing);
        setPhone(value.phone || "");
        setService(value.service || "");
        setClientId(value.clientId || "");
        setSelectedQuote(value.externalQuoteId || "");
        setLegacyQuote(value.quoteId || "");
      }
    } catch {
      /* Keep account data untouched if a browser draft is invalid. */
    }
  }, [key, accountId]);
  useEffect(() => {
    if (section !== "Clientes" && section !== "Agenda") return;
    let alive = true;
    fetch("/api/quotes")
      .then(async (r) => {
        if (!r.ok) throw Error();
        const b = await r.json();
        if (alive) setQuotes(b.quotes || []);
      })
      .catch(() => {
        if (alive)
          setQuoteError(
            tr(
              "No se pudieron cargar las cotizaciones.",
              "Could not load quotes.",
            ),
          );
      });
    return () => {
      alive = false;
    };
  }, [section, en]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (params.get("nueva") === "1" && ready && section === "Agenda")
      setEditing("new");
  }, [params, ready, section]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    let queued = false;
    const reveal = () => {
      if (queued) return;
      queued = true;
      setVisible((v) => v + 20);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal();
      },
      { rootMargin: "160px" },
    );
    // Safari can miss an observer update after restoring a suspended page.
    const check = () => {
      const rect = node.getBoundingClientRect();
      if (
        rect.top <
          (window.visualViewport?.height || window.innerHeight) + 160 &&
        rect.bottom >= 0
      )
        reveal();
    };
    observer.observe(node);
    document.addEventListener("scroll", check, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", check, true);
      window.removeEventListener("resize", check);
    };
  }, [visible, ready, section, search, filter, week, data]);
  useEffect(() => {
    if (section === "Clientes" && params.get("cliente"))
      setDetail(params.get("cliente"));
  }, [section, params]);
  useEffect(() => {
    if (!editing || !accountId) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || "{}");
      if (stored._editing)
        sessionStorage.setItem(key, JSON.stringify({ ...stored, phone }));
    } catch {}
  }, [phone, editing, key, accountId]);
  useEffect(() => {
    if (editing === "new")
      setService(
        (current) =>
          current ||
          quotes.find((q) => q.id === selectedQuote)?.title ||
          data.quotes.find((q) => q.id === params.get("anterior"))?.title ||
          "",
      );
  }, [editing, selectedQuote, quotes, data.quotes, params]);
  const navigate = (tab: string, extra: Record<string, string> = {}) =>
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}?${new URLSearchParams({ tab, ...extra })}`,
    );
  function openEdit(id: string) {
    setFormError("");
    setDraft({});
    sessionStorage.removeItem(key);
    setEditing(id);
    setPhone(data.clients.find((c) => c.id === id)?.phone || "");
    const w = data.work.find((w) => w.id === id);
    setService(w?.service || "");
    setLegacyQuote(w?.quoteId || params.get("anterior") || "");
    setClientId(w?.clientId || params.get("cliente") || "");
    setSelectedQuote(w?.externalQuoteId || params.get("cotizacion") || "");
  }
  function closeEdit() {
    setEditing(null);
    setDraft({});
    sessionStorage.removeItem(key);
    setFormError("");
  }
  function persist(form: HTMLFormElement) {
    const values = Object.fromEntries(
      [...new FormData(form).entries()].map(([k, v]) => [k, String(v)]),
    );
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...values, _editing: editing, phone }),
    );
  }
  async function apply(run: () => Business) {
    if (submitLock.current) return;
    submitLock.current = true;
    try {
      setFormError("");
      if (await commit(run())) {
        closeEdit();
        setStock(null);
      }
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message
          : tr("Revise los datos.", "Check the information."),
      );
    } finally {
      submitLock.current = false;
    }
  }
  const source =
    section === "Clientes"
      ? data.clients
      : section === "Inventario"
        ? data.products
        : data.work;
  const row = source.find((r) => r.id === editing) as unknown as
    | Record<string, unknown>
    | undefined;
  const value = (name: string) =>
    draft[name] ??
    String(
      row?.[name] ??
        (name === "service"
          ? quotes.find((q) => q.id === selectedQuote)?.title ||
            data.quotes.find((q) => q.id === params.get("anterior"))?.title ||
            ""
          : ""),
    );
  const input = (
    name: string,
    label: string,
    type = "text",
    required = true,
  ) => (
    <label className="block text-[13px] font-bold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.001" : undefined}
        defaultValue={
          type === "datetime-local" ? value(name).slice(0, 16) : value(name)
        }
        className={field+(type==="datetime-local"?" appearance-none":"")}
      />
    </label>
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) || ""),
      n = (k: string) => Number(f.get(k));
    const id = editing === "new" ? crypto.randomUUID() : editing!;
    if (section === "Clientes" && phone && !isPhoneComplete(phone)) {
      setFormError(tr("Revise el teléfono.", "Check the phone number."));
      return;
    }
    await apply(() =>
      section === "Clientes"
        ? saveClient(data, {
            id,
            name: s("name"),
            email: s("email"),
            phone,
            notes: s("notes"),
            archived: Boolean(row?.archived),
          })
        : section === "Inventario"
          ? saveProduct(data, {
              id,
              sku: s("sku"),
              name: s("name"),
              stock: row ? Number(row.stock) : n("stock"),
              minimum: n("minimum"),
              cost: n("cost"),
              price: n("price"),
              archived: Boolean(row?.archived),
            })
          : saveAppointment(data, {
              id,
              bookingClientId: typeof row?.bookingClientId === "string" ? row.bookingClientId : undefined,
              clientId,
              client: data.clients.find((c) => c.id === clientId)?.name || "",
              service: s("service"),
              stage: row?.stage === "completed" ? "completed" : "scheduled",
              cancelled: Boolean(row?.cancelled),
              start: costaRicaDate(s("start")),
              end: costaRicaDate(s("end")),
              quoteId: s("quoteId") || undefined,
              externalQuoteId: selectedQuote || undefined,
            }),
    );
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = week || today;
  const end = new Date(`${start}T00:00:00-06:00`);
  end.setUTCDate(end.getUTCDate() + 7);
  const weekEnd = end.toISOString().slice(0, 10);
  const date = (d: string) =>
    new Intl.DateTimeFormat(en ? "en-US" : "es-CR", {
      timeZone: "America/Costa_Rica",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(d));
  const money = proMoney;
  const matches = (text: string) =>
    text
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(
        search
          .toLocaleLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, ""),
      );
  const clients = data.clients.filter(
    (c) =>
      matches(`${c.name} ${c.email} ${c.phone}`) &&
      (filter === "archived"
        ? c.archived
        : filter === "all"
          ? !c.archived
          : true),
  );
  const products = data.products.filter(
    (p) =>
      matches(`${p.name} ${p.sku}`) &&
      (filter === "archived"
        ? p.archived
        : !p.archived && (filter !== "low" || p.stock <= p.minimum)),
  );
  const work = [...data.work]
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter(
      (w) =>
        matches(`${w.client} ${w.service}`) &&
        (!calendarDay || w.start.slice(0,10)===calendarDay) &&
        (filter === "completed"
          ? w.stage === "completed"
          : filter === "cancelled"
            ? w.cancelled
            : filter === "today"
              ? !w.cancelled && w.start.slice(0, 10) === today
              : filter === "upcoming"
                ? !w.cancelled &&
                  w.stage !== "completed" &&
                  w.start.slice(0, 10) >= today
                : true) &&
        (view !== "week" ||
          (w.start.slice(0, 10) >= start && w.start.slice(0, 10) < weekEnd)),
    );
  const list =
    section === "Clientes"
      ? clients
      : section === "Inventario"
        ? products
        : work;
  const labels =
    section === "Clientes"
      ? { all: tr("Activos", "Active"), archived: tr("Archivados", "Archived") }
      : section === "Inventario"
        ? {
            all: tr("Activos", "Active"),
            low: tr("Existencias bajas", "Low stock"),
            archived: tr("Archivados", "Archived"),
          }
        : {
            all: tr("Todas", "All"),
            today: tr("Hoy", "Today"),
            upcoming: tr("Próximas", "Upcoming"),
            completed: tr("Finalizadas", "Completed"),
            cancelled: tr("Canceladas", "Cancelled"),
          };
  const createLabel =
    section === "Clientes"
      ? tr("Nuevo cliente", "New customer")
      : section === "Inventario"
        ? tr("Nuevo producto", "New product")
        : tr("Nueva cita", "New appointment");
  const Icon =
    section === "Clientes"
      ? Users
      : section === "Inventario"
        ? Package
        : CalendarDays;
  const customer = data.clients.find((c) => c.id === detail),
    product = data.products.find((p) => p.id === detail),
    appointment = data.work.find((w) => w.id === detail);
  const clientQuotes = (id: string) =>
    quotes.filter((q) =>
      data.quoteLinks.some((l) => l.quoteId === q.id && l.clientId === id),
    );
  const quoteOptions = quotes.filter(
    (q) =>
      q.status === "accepted" &&
      data.quoteLinks.some(
        (l) => l.quoteId === q.id && l.clientId === clientId,
      ),
  );
  if (section === "Redes") return <SocialPanel server />;
  return (
    <div data-business-panel="" className="space-y-4">
      <SectionHeadline
        subtitulo={
          section === "Agenda"
            ? tr(
                "Organice sus citas en horario de Costa Rica.",
                "Manage appointments in Costa Rica time.",
              )
            : section === "Clientes"
              ? tr(
                  "Sus clientes y el historial de cada trabajo.",
                  "Your customers and their work history.",
                )
              : tr(
                  "Controle sus materiales y existencias.",
                  "Manage materials and stock.",
                )
        }
      >
        <Button
          size="crear"
          disabled={!ready || saving}
          className="w-full sm:w-auto"
          onClick={() => openEdit("new")}
        >
          <Plus className="h-4 w-4" />
          {createLabel}
        </Button>
      </SectionHeadline>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}{" "}
          <Button variant="secondary" onClick={reload}>
            {tr("Recargar datos", "Reload data")}
          </Button>
        </p>
      )}
      {exportError && (
        <p role="alert" className="text-sm text-red-700">
          {exportError}
        </p>
      )}
      {quoteError && <p role="alert">{quoteError}</p>}
      {!ready && !error ? (
        <PanelListSkeleton rows={3} compacto withSearch />
      ) : (
        <>
          {section === "Agenda" && <><AgendaCalendar data={data} commit={commit} saving={saving} day={calendarDay} onDay={setCalendarDay}/>{calendarDay&&<Button variant="secondary" onClick={()=>setCalendarDay("")}>{tr("Ver todas las citas","View all appointments")}</Button>}</>}
          <label className="relative block">
            <Search
              aria-hidden
              className="absolute left-3 top-3 h-5 w-5 text-[#68778d]"
            />
            <input
              aria-label={tr("Buscar registros", "Search records")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisible(20);
              }}
              placeholder={
                section === "Clientes"
                  ? tr("Buscar cliente", "Search customers")
                  : section === "Inventario"
                    ? tr("Buscar producto o código", "Search product or code")
                    : tr(
                        "Buscar cita o cliente",
                        "Search appointments or customers",
                      )
              }
              className={`${field} pl-10`}
            />
          </label>
          <StatusFilterTabs
            tabs={Object.keys(labels).map((id) => ({ id }))}
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setVisible(20);
            }}
            labelFor={(id) => labels[id as keyof typeof labels] || id}
            variant="pills"
            limpiable={false}
          />
          {section === "Agenda" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={view === "list" ? "default" : "secondary"}
                onClick={() => {
                  setView("list");
                  setVisible(20);
                }}
              >
                {tr("Lista", "List")}
              </Button>
              <Button
                variant={view === "week" ? "default" : "secondary"}
                onClick={() => {
                  setView("week");
                  setVisible(20);
                }}
              >
                {tr("Semana", "Week")}
              </Button>
              {view === "week" && (
                <>
                  <Button
                    variant="secondary"
                    aria-label={tr("Semana anterior", "Previous week")}
                    onClick={() => {
                      const d = new Date(`${start}T12:00:00-06:00`);
                      d.setUTCDate(d.getUTCDate() - 7);
                      setWeek(d.toISOString().slice(0, 10));
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <input
                    aria-label={tr("Inicio de semana", "Week starting")}
                    type="date"
                    value={start}
                    onChange={(e) => setWeek(e.target.value)}
                    className="min-h-11 max-w-full rounded-xl border border-[#e5e7eb] bg-white p-2"
                  />
                  <Button
                    variant="secondary"
                    aria-label={tr("Semana siguiente", "Next week")}
                    onClick={() => setWeek(weekEnd)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
          {!list.length ? (
            <PanelEmptyState
              icon={Icon}
              title={tr(
                "No hay registros en esta vista",
                "No records in this view",
              )}
              description={tr(
                "Pruebe otro filtro o agregue el primero.",
                "Try another filter or add your first record.",
              )}
            />
          ) : (
            <div className="space-y-2">
              {list.slice(0, visible).map((item) => {
                const c =
                    section === "Clientes"
                      ? data.clients.find((c) => c.id === item.id)
                      : undefined,
                  p =
                    section === "Inventario"
                      ? data.products.find((p) => p.id === item.id)
                      : undefined,
                  w =
                    section === "Agenda"
                      ? data.work.find((w) => w.id === item.id)
                      : undefined;
                const title =
                  c?.name ||
                  (p ? `${p.name} · ${p.sku}` : `${w?.client} · ${w?.service}`);
                const subtitle = c
                  ? [c.phone, c.email].filter(Boolean).join(" · ")
                  : p
                    ? `${p.stock} ${tr("unidades", "units")} · ${money(p.price)}${p.stock <= p.minimum ? " · " + tr("Existencias bajas", "Low stock") : ""}`
                    : date(w!.start);
                const actions: CardAction[] = [
                  {
                    label: tr("Editar", "Edit"),
                    onClick: () => openEdit(item.id),
                  },
                ];
                if (c)
                  actions.push({
                    label: c.archived
                      ? tr("Restaurar", "Restore")
                      : tr("Archivar", "Archive"),
                    onClick: () =>
                      void apply(() =>
                        saveClient(data, { ...c, archived: !c.archived }),
                      ),
                  });
                if (p)
                  actions.push({
                    label: p.archived
                      ? tr("Restaurar", "Restore")
                      : tr("Archivar", "Archive"),
                    onClick: () =>
                      void apply(() =>
                        saveProduct(data, { ...p, archived: !p.archived }),
                      ),
                  });
                if (w && !w.cancelled && w.stage !== "completed")
                  actions.push(
                    {
                      label: tr("Finalizar", "Complete"),
                      onClick: () =>
                        void apply(() =>
                          saveAppointment(data, { ...w, stage: "completed" }),
                        ),
                    },
                    {
                      label: tr("Cancelar cita", "Cancel appointment"),
                      destructive: true,
                      onClick: () =>
                        void apply(() =>
                          saveAppointment(data, { ...w, cancelled: true }),
                        ),
                    },
                  );
                return (
                  <article
                    key={item.id}
                    className="flex items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(item.id)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                    >
                      <span className="ccr-caja-icono-plana grid h-11 w-11 shrink-0 place-items-center rounded-[14px]">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <h2 className="break-words text-[15px] font-extrabold text-[#162543]">
                          {title}
                        </h2>
                        <span className="block break-words text-[13px] text-[#52627a]">
                          {subtitle}
                        </span>
                        {w && (
                          <span className="text-xs text-[#68778d]">
                            {w.cancelled
                              ? tr("Cancelada", "Cancelled")
                              : w.stage === "completed"
                                ? tr("Finalizada", "Completed")
                                : tr("Agendada", "Scheduled")}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8ba]" />
                    </button>
                    <CardActionsMenu
                      label={tr("Opciones de ", "Options for ") + title}
                      actions={saving ? [] : actions}
                    />
                  </article>
                );
              })}
            </div>
          )}
          {visible < list.length && (
            <div ref={sentinel}>
              <Button
                variant="secondary"
                onClick={() => setVisible((v) => v + 20)}
              >
                {tr("Ver más", "Show more")}
              </Button>
            </div>
          )}
          {!!list.length && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                onClick={async () => {
                  setExportError("");
                  try {
                    await downloadFile(
                      section === "Agenda"
                        ? exportWork(work)
                        : businessCsv(
                            section === "Clientes"
                              ? clients.map((c) => ({
                                  [tr("Nombre", "Name")]: c.name,
                                  [tr("Correo", "Email")]: c.email,
                                  [tr("Teléfono", "Phone")]: c.phone,
                                  [tr("Notas", "Notes")]: c.notes,
                                }))
                              : products.map((p) => ({
                                  [tr("Código", "Code")]: p.sku,
                                  [tr("Producto", "Product")]: p.name,
                                  [tr("Existencias", "Stock")]: p.stock,
                                  [tr("Mínimo", "Minimum")]: p.minimum,
                                  [tr("Costo", "Cost")]: p.cost,
                                  [tr("Precio", "Price")]: p.price,
                                })),
                          ),
                      `${section.toLowerCase()}.csv`,
                      "text/csv;charset=utf-8",
                    );
                  } catch {
                    setExportError(
                      tr(
                        "No se pudo exportar. En la app móvil, compruebe que tiene una versión actualizada.",
                        "Could not export. In the mobile app, check that your version is up to date.",
                      ),
                    );
                  }
                }}
              >
                {tr(
                  "Exportar vista · CSV para Excel",
                  "Export view · CSV for Excel",
                )}
              </Button>
            </div>
          )}
        </>
      )}
      {detail && (
        <Modal
          title={customer?.name || product?.name || appointment?.service || ""}
          onClose={() => setDetail(null)}
          size="md"
          mobilePresentation="fullscreen"
          closeLabel={tr("Cerrar", "Close")}
          footer={
            <Button
              onClick={() => {
                setDetail(null);
                openEdit(detail);
              }}
            >
              {tr("Editar", "Edit")}
            </Button>
          }
        >
          {customer && (
            <div className="space-y-5">
              <p className="break-words text-sm text-[#52627a]">
                {[customer.phone, customer.email].filter(Boolean).join(" · ")}
              </p>
              {customer.notes && (
                <p className="whitespace-pre-wrap break-words">
                  {customer.notes}
                </p>
              )}
              {!customer.archived && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      navigate("quotes", { nueva: "1", cliente: customer.id })
                    }
                  >
                    {tr("Crear cotización", "Create quote")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate("pro_agenda", {
                        nueva: "1",
                        cliente: customer.id,
                      })
                    }
                  >
                    {tr("Agendar cita", "Schedule appointment")}
                  </Button>
                </div>
              )}
              <h3 className="font-bold">{tr("Cotizaciones", "Quotes")}</h3>
              {clientQuotes(customer.id).map((q) => (
                <button
                  key={q.id}
                  className="block w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] text-[#162543]"
                  onClick={() => navigate("quotes", { cotizacion: q.id })}
                >
                  {q.title} · {money(q.total)}
                </button>
              ))}
              {data.quotes
                .filter((q) => q.clientId === customer.id)
                .map((q) => (
                  <button
                    key={q.id}
                    className="block w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] text-[#162543]"
                    onClick={() => navigate("quotes", { cotizacion: q.id })}
                  >
                    {q.title}
                  </button>
                ))}
              {!clientQuotes(customer.id).length &&
                !data.quotes.some((q) => q.clientId === customer.id) && (
                  <p className="text-sm text-[#68778d]">
                    {tr("Todavía no hay cotizaciones.", "No quotes yet.")}
                  </p>
                )}
              <h3 className="font-bold">{tr("Citas", "Appointments")}</h3>
              {data.work
                .filter((w) => w.clientId === customer.id)
                .map((w) => (
                  <p
                    key={w.id}
                    className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-[15px] text-[#52627a]"
                  >
                    {w.service} · {date(w.start)} ·{" "}
                    {w.cancelled
                      ? tr("Cancelada", "Cancelled")
                      : w.stage === "completed"
                        ? tr("Finalizada", "Completed")
                        : tr("Agendada", "Scheduled")}
                  </p>
                ))}
              {!data.work.some((w) => w.clientId === customer.id) && (
                <p className="text-sm text-[#68778d]">
                  {tr("Todavía no hay citas.", "No appointments yet.")}
                </p>
              )}
            </div>
          )}
          {product && (
            <div className="space-y-4">
              <p>
                {product.sku} · {product.stock} {tr("unidades", "units")}
              </p>
              <p>
                {tr("Precio", "Price")}: {money(product.price)} ·{" "}
                {tr("Costo", "Cost")}: {money(product.cost)}
              </p>
              {!product.archived && (
                <Button
                  onClick={() => {
                    setStock(product.id);
                    setDetail(null);
                  }}
                >
                  {tr("Registrar movimiento", "Record stock movement")}
                </Button>
              )}
              <h3 className="font-bold">
                {tr("Historial de movimientos", "Stock history")}
              </h3>
              {[...data.movements]
                .reverse()
                .filter((m) => m.productId === product.id)
                .map((m) => (
                  <p key={m.id} className="border-b py-3">
                    {m.delta > 0 ? "+" : ""}
                    {m.delta} · {m.reason}
                    <span className="block text-xs text-[#68778d]">
                      {date(m.at)}
                    </span>
                  </p>
                ))}
            </div>
          )}
          {appointment && (
            <div className="space-y-4">
              <p>{appointment.client}</p>
              <p>
                {date(appointment.start)} — {date(appointment.end)}
              </p>
              {(appointment.quoteId || appointment.externalQuoteId) && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate("quotes", {
                      cotizacion:
                        appointment.externalQuoteId || appointment.quoteId!,
                    })
                  }
                >
                  {tr("Ver cotización", "View quote")}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  navigate("pro_clients", { cliente: appointment.clientId })
                }
              >
                {tr("Ver cliente", "View customer")}
              </Button>
            </div>
          )}
        </Modal>
      )}
      {editing && (
        <Modal
          title={
            editing === "new"
              ? createLabel
              : tr("Editar registro", "Edit record")
          }
          onClose={closeEdit}
          closeLabel={tr("Cerrar", "Close")}
          size="md"
          mobilePresentation="fullscreen"
          footerNotice={
            formError || error ? (
              <p role="alert" className="text-sm text-red-700">
                {formError || error}
              </p>
            ) : undefined
          }
          footer={
            <Button type="submit" form="pro-business-form" disabled={saving}>
              {saving ? tr("Guardando…", "Saving…") : tr("Guardar", "Save")}
            </Button>
          }
        >
          <form
            id="pro-business-form"
            key={editing}
            onChange={(e) => persist(e.currentTarget)}
            onSubmit={submit}
            className="space-y-4"
          >
            {section === "Clientes" && (
              <>
                {input("name", tr("Nombre", "Name"))}
                {input("email", tr("Correo", "Email"), "email", false)}
                <PhoneInput
                  label={tr("Teléfono", "Phone")}
                  value={phone}
                  onChange={setPhone}
                />
                <label className="block text-[13px] font-bold">
                  {tr("Notas", "Notes")}
                  <textarea
                    name="notes"
                    defaultValue={value("notes")}
                    maxLength={2000}
                    className={field}
                  />
                </label>
              </>
            )}
            {section === "Inventario" && (
              <>
                {input("sku", tr("Código", "Code"))}
                {input("name", tr("Producto", "Product"))}
                {editing === "new" &&
                  input(
                    "stock",
                    tr("Existencias iniciales", "Initial stock"),
                    "number",
                  )}
                {input("minimum", tr("Mínimo", "Minimum"), "number")}
                {input("cost", tr("Costo unitario ₡", "Unit cost ₡"), "number")}
                {input(
                  "price",
                  tr("Precio unitario ₡", "Unit price ₡"),
                  "number",
                )}
              </>
            )}
            {section === "Agenda" && (
              <>
                <label className="block text-[13px] font-bold">
                  {tr("Cliente", "Customer")}
                  <select
                    aria-label={tr("Cliente", "Customer")}
                    name="clientId"
                    value={clientId}
                    required
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setSelectedQuote("");
                      setLegacyQuote("");
                    }}
                    className={field}
                  >
                    <option value="">
                      {tr("Seleccione un cliente", "Choose a customer")}
                    </option>
                    {data.clients
                      .filter((c) => !c.archived || c.id === row?.clientId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-[13px] font-bold">
                  {tr("Trabajo", "Work")}
                  <input
                    name="service"
                    required
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    className={field}
                  />
                </label>
                {input(
                  "start",
                  tr("Inicio · Costa Rica", "Start · Costa Rica"),
                  "datetime-local",
                )}
                {input(
                  "end",
                  tr("Final · Costa Rica", "End · Costa Rica"),
                  "datetime-local",
                )}
                <input type="hidden" name="quoteId" value={legacyQuote} />
                <input
                  type="hidden"
                  name="externalQuoteId"
                  value={selectedQuote}
                />
                <label className="block text-[13px] font-bold">
                  {tr(
                    "Cotización aceptada (opcional)",
                    "Accepted quote (optional)",
                  )}
                  <select
                    aria-label={tr(
                      "Cotización aceptada (opcional)",
                      "Accepted quote (optional)",
                    )}
                    value={
                      selectedQuote ? "quote:" + selectedQuote : legacyQuote
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedQuote(
                        value.startsWith("quote:") ? value.slice(6) : "",
                      );
                      setLegacyQuote(value.startsWith("quote:") ? "" : value);
                    }}
                    className={field}
                  >
                    <option value="">{tr("Sin cotización", "No quote")}</option>
                    {quoteOptions.map((q) => (
                      <option key={q.id} value={"quote:" + q.id}>
                        {q.title}
                      </option>
                    ))}
                    {data.quotes
                      .filter(
                        (q) =>
                          q.status === "accepted" && q.clientId === clientId,
                      )
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.title}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
          </form>
        </Modal>
      )}
      {stock && (
        <Modal
          title={tr("Registrar movimiento", "Record stock movement")}
          closeLabel={tr("Cerrar", "Close")}
          onClose={() => setStock(null)}
          footerNotice={
            formError || error ? (
              <p role="alert" className="text-red-700">
                {formError || error}
              </p>
            ) : undefined
          }
          footer={
            <Button form="pro-stock-form" type="submit" disabled={saving}>
              {tr("Guardar movimiento", "Save movement")}
            </Button>
          }
        >
          <form
            id="pro-stock-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void apply(() =>
                moveStock(
                  data,
                  stock,
                  Number(f.get("quantity")) *
                    (f.get("kind") === "out" ? -1 : 1),
                  String(f.get("reason")),
                  crypto.randomUUID(),
                  new Date().toISOString(),
                ),
              );
            }}
          >
            <label className="block font-bold">
              {tr("Tipo de movimiento", "Movement type")}
              <select
                aria-label={tr("Tipo de movimiento", "Movement type")}
                name="kind"
                className={field}
              >
                <option value="in">{tr("Entrada", "Stock in")}</option>
                <option value="out">{tr("Salida", "Stock out")}</option>
              </select>
            </label>
            <label className="block font-bold">
              {tr("Cantidad", "Quantity")}
              <input
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
                className={field}
              />
            </label>
            <label className="block font-bold">
              {tr("Motivo del movimiento", "Movement reason")}
              <input name="reason" required maxLength={160} className={field} />
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
