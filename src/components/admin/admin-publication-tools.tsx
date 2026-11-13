"use client";

import { useState } from "react";
import { Eye, Loader2, Pencil, Phone } from "lucide-react";
import { PUBLICATION_EDIT_LIMITS, type EditablePublicationKind, type PublicationEdit } from "@/lib/admin/publication-edit";
import type { PublicationStats } from "@/lib/admin/publication-stats";

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("es-CR")} ${count === 1 ? one : many}`;

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

/**
 * VISTAS Y CLICS DE CONTACTO de una publicación. Reemplaza a «postulaciones»:
 * ya nadie se postula dentro del app, hoy se toca WhatsApp. Se muestran los
 * clics y, si difieren, cuántas personas distintas fueron.
 */
export function PublicationStatsLine({ stats, showPhone = false }: { stats?: PublicationStats; showPhone?: boolean }) {
  const s = stats ?? { views: 0, whatsapp: { clicks: 0, people: 0 }, phone: { clicks: 0, people: 0 } };
  const people = (channel: { clicks: number; people: number }) => channel.people > 0 && channel.people !== channel.clicks ? ` de ${plural(channel.people, "persona", "personas")}` : "";
  return (
    <div data-publication-stats className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
      <span data-stat="whatsapp" className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${s.whatsapp.clicks ? "bg-[#e8f8ee] text-[#15803d]" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
        <WhatsAppMark />{plural(s.whatsapp.clicks, "clic", "clics")} a WhatsApp{people(s.whatsapp)}
      </span>
      {showPhone && (
        <span data-stat="phone" className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${s.phone.clicks ? "bg-[#e0f2fe] text-[#0369a1]" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
          <Phone className="h-3.5 w-3.5" />{plural(s.phone.clicks, "clic", "clics")} a llamar{people(s.phone)}
        </span>
      )}
      <span data-stat="views" className="inline-flex items-center gap-1 rounded-md bg-[#f3f4f6] px-2 py-1 text-[#6b7280]">
        <Eye className="h-3.5 w-3.5" />{plural(s.views, "vista", "vistas")}
      </span>
    </div>
  );
}

/**
 * EDITAR TÍTULO Y DESCRIPCIÓN desde el panel, en la misma fila. Sin
 * `window.prompt`: se ve lo que se va a guardar y cuántos caracteres admite.
 */
export function PublicationEditor({ kind, id, title, description, onSaved, onCancel }: {
  kind: EditablePublicationKind;
  id: string;
  title: string;
  description: string;
  onSaved: (value: PublicationEdit) => void;
  onCancel: () => void;
}) {
  const limits = PUBLICATION_EDIT_LIMITS[kind];
  const [draft, setDraft] = useState<PublicationEdit>({ title, description });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm text-[#162543] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/publication-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, ...draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      onSaved({ title: data.title ?? draft.title.trim(), description: data.description ?? draft.description.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form data-publication-editor className="mt-3 space-y-3 rounded-xl border border-[#dbe7ef] bg-[#f8fcff] p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="block">
        <span className="mb-1 flex justify-between text-xs font-semibold text-[#374151]"><span>Título</span><span className="font-normal text-[#68778d]">{draft.title.trim().length}/{limits.title[1]}</span></span>
        <input name="title" value={draft.title} maxLength={limits.title[1]} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${field} h-11`} />
      </label>
      <label className="block">
        <span className="mb-1 flex justify-between text-xs font-semibold text-[#374151]"><span>Descripción</span><span className="font-normal text-[#68778d]">{draft.description.trim().length}/{limits.description[1]}</span></span>
        <textarea name="description" value={draft.description} maxLength={limits.description[1]} rows={5} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${field} py-2 leading-6`} />
      </label>
      {error && <p role="alert" className="text-xs font-semibold text-[#b91c1c]">{error}</p>}
      <p className="text-[11px] text-[#68778d]">El cambio se publica de inmediato y queda en la bitácora con el texto anterior.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} onClick={onCancel} className="inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] bg-white px-3 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-60">Cancelar</button>
        <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#009FD9] px-4 text-xs font-semibold text-white hover:bg-[#0089bb] disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Guardar cambios
        </button>
      </div>
    </form>
  );
}

export function EditPublicationButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-60">
      <Pencil className="h-3.5 w-3.5" /> Editar texto
    </button>
  );
}
