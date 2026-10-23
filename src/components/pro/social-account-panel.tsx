"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import {
  PanelEmptyState,
  PanelListSkeleton,
} from "@/components/ui/content-loading";
import { socialMonth, type SocialRequest } from "@/lib/pro/social";
const field =
  "mt-2 block min-h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[15px]";
export function SocialAccountPanel({
  rows,
  ready,
  busy,
  error,
  send,
}: {
  rows: SocialRequest[];
  ready: boolean;
  busy: boolean;
  error: string;
  send: (body: Record<string, unknown>) => Promise<void>;
}) {
  const en = useLocale() === "en",
    tr = (es: string, eng: string) => (en ? eng : es);
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState(false),
    [title, setTitle] = useState(""),
    [link, setLink] = useState(""),
    [description, setDescription] = useState("");
  const [content, setContent] = useState<{ title: string; link: string }[]>([]);
  const used = rows.some(
    (r) => r.month === socialMonth(new Date()) && r.status !== "rejected",
  );
  useEffect(() => {
    let alive = true;
    fetch("/api/pro/social-content")
      .then((r) => r.json())
      .then((b) => {
        if (alive) setContent(b.content || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const status = (s: string) =>
    ({
      pending: tr("Pendiente", "Pending"),
      approved: tr("Aprobada", "Approved"),
      rejected: tr("Rechazada", "Rejected"),
      published: tr("Publicada", "Published"),
    })[s] || s;
  return (
    <div className="space-y-4">
      <SectionHeadline
        subtitulo={tr(
          "Una difusión mensual en las redes de ContrataCR.",
          "One monthly feature on ContrataCR social channels.",
        )}
      >
        <Button
          size="crear"
          disabled={!ready || used}
          onClick={() => {
            setOpen(true);
            setPreview(false);
          }}
        >
          {tr("Solicitar difusión", "Request feature")}
        </Button>
      </SectionHeadline>
      <p className="rounded-xl bg-[#eaf7fc] px-4 py-3 text-sm font-semibold text-[#162543]">
        {used
          ? tr(
              "Cupo de este mes reservado o utilizado.",
              "This month’s feature is reserved or used.",
            )
          : tr(
              "Tiene una difusión disponible este mes.",
              "You have one feature available this month.",
            )}
      </p>
      {error && !open && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {!ready ? (
        <PanelListSkeleton rows={3} />
      ) : !rows.length ? (
        <PanelEmptyState
          icon={Megaphone}
          title={tr(
            "Todavía no ha solicitado difusión",
            "No features requested yet",
          )}
          description={tr(
            "Elija qué quiere destacar y revisaremos su solicitud.",
            "Choose what to feature and we will review your request.",
          )}
        />
      ) : (
        <div className="space-y-2">
          {[...rows]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((r) => (
              <article
                key={r.id}
                className="space-y-2 rounded-2xl border border-[#e5e7eb] bg-white p-4"
              >
                <h2 className="break-words text-[15px] font-extrabold text-[#162543]">
                  {r.title}
                </h2>
                <p className="text-sm text-[#52627a]">
                  {status(r.status)} · {r.month}
                </p>
                {r.note && <p className="text-sm">{r.note}</p>}
                <a
                  href={r.publishedUrl || r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-bold text-[#009fca]"
                >
                  {r.publishedUrl
                    ? tr("Ver publicación", "View publication")
                    : tr("Ver contenido solicitado", "View requested content")}
                </a>
              </article>
            ))}
        </div>
      )}
      {open && (
        <Modal
          title={
            preview
              ? tr("Revisar solicitud", "Review request")
              : tr("Solicitar difusión", "Request feature")
          }
          closeLabel={tr("Cerrar", "Close")}
          onClose={() => setOpen(false)}
          mobilePresentation="fullscreen"
          footerNotice={
            error ? (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            ) : undefined
          }
          footer={
            used ? (
              <Button onClick={() => setOpen(false)}>
                {tr("Listo", "Done")}
              </Button>
            ) : preview ? (
              <div className="flex w-full gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setPreview(false)}
                >
                  {tr("Editar", "Edit")}
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    await send({
                      id: crypto.randomUUID(),
                      title,
                      link,
                      description,
                    });
                  }}
                >
                  {busy
                    ? tr("Enviando…", "Sending…")
                    : tr("Enviar solicitud", "Submit request")}
                </Button>
              </div>
            ) : (
              <Button form="social-feature-form" type="submit">
                {tr("Continuar", "Continue")}
              </Button>
            )
          }
        >
          {used ? (
            <p>
              {tr(
                "Su solicitud quedó registrada. Puede revisar su estado en el historial.",
                "Your request is recorded. Check its status in the history.",
              )}
            </p>
          ) : preview ? (
            <div className="space-y-4">
              <h3 className="text-lg font-bold">{title}</h3>
              <p className="whitespace-pre-wrap break-words">{description}</p>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[#009fca]"
              >
                {link}
              </a>
              <p className="rounded-xl bg-[#f7f9fc] p-3 text-sm text-[#52627a]">
                {tr(
                  "Una difusión orgánica por mes calendario, sujeta a revisión. No incluye anuncios pagados ni garantiza alcance o contrataciones. Los cupos no se acumulan. Si se rechaza, puede solicitar otra.",
                  "One organic feature per calendar month, subject to review. Paid advertising is not included; reach or bookings are not guaranteed. Slots do not carry over. A rejection lets you submit again.",
                )}
              </p>
            </div>
          ) : (
            <form
              id="social-feature-form"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setPreview(true);
              }}
            >
              <label className="block text-sm font-bold">
                {tr("Contenido propio", "Your content")}
                <select
                  className={field}
                  defaultValue=""
                  onChange={(e) => {
                    const item = content.find((c) => c.link === e.target.value);
                    if (item) {
                      setTitle(item.title);
                      setLink(item.link);
                    }
                  }}
                >
                  <option value="">
                    {tr(
                      "Seleccionar mi perfil o escribir otro enlace",
                      "Choose my profile or enter another link",
                    )}
                  </option>
                  {content.map((c) => (
                    <option key={c.link} value={c.link}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold">
                {tr("Título", "Title")}
                <input
                  required
                  maxLength={160}
                  className={field}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block text-sm font-bold">
                {tr(
                  "Enlace a su perfil o publicación",
                  "Profile or publication link",
                )}
                <input
                  type="url"
                  pattern="https://.*"
                  required
                  className={field}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </label>
              <label className="block text-sm font-bold">
                {tr("Qué desea destacar", "What to feature")}
                <textarea
                  required
                  maxLength={1500}
                  className={field}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
