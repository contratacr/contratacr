"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AdjuntosDelMensaje } from "@/components/support/compositor-de-soporte";
import type { AdjuntoDeSoporte } from "@/lib/support/adjuntos";
import { LONG_TEXT_MAX_LENGTH } from "@/lib/text-limits";

type Message = { id: string; body: string; sender_role: string; attachments?: AdjuntoDeSoporte[] };
type Thread = { ticket: { subject: string; status: string }; messages: Message[] };

export function GuestSupportCase({ id }: { id: string }) {
  const t = useTranslations("guestSupport");
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const initialToken = useRef<string | null>(null);
  const endpoint = `/api/support/guest/${encodeURIComponent(id)}`;
  const login = `/login?redirect=${encodeURIComponent(`/dashboard/profesional?tab=soporte&ticket=${id}`)}`;

  useEffect(() => {
    let active = true;
    // Read once even during React Strict Mode. Remove the capability from the
    // address bar immediately; subsequent reads/replies use an HttpOnly cookie.
    if (initialToken.current === null) {
      initialToken.current = window.location.hash.slice(1);
      window.history.replaceState(null, "", window.location.pathname);
    }
    async function load() {
      try {
        if (initialToken.current) {
          const opened = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", token: initialToken.current }) });
          if (!opened.ok) throw new Error(opened.status === 403 ? "invalid" : "failed");
        }
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "invalid" : "failed");
        const data = await response.json();
        if (active) setThread(data);
      } catch (e) {
        if (active) setError(e instanceof Error && e.message === "invalid" ? "invalid" : "failed");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [endpoint, attempt]);

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true); setError(""); setSent(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reply", body }) });
      if (!response.ok) throw new Error(response.status === 403 ? "invalid" : "failed");
      setBody(""); setSent(true);
      const refreshed = await fetch(endpoint, { cache: "no-store" });
      if (refreshed.ok) setThread(await refreshed.json());
    } catch (e) { setError(e instanceof Error && e.message === "invalid" ? "invalid" : "failed"); }
    finally { setSending(false); }
  }

  return <main className="min-h-screen bg-[#f4f7fa] px-4 py-8 text-[#162543]">
    <div className="mx-auto max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-8">
      <Link href="/" className="text-sm font-bold text-[#009FD9]">ContrataCR</Link>
      <h1 className="mt-4 text-xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-[#5b6472]">{t("intro")}</p>
      {loading && <p role="status" className="mt-5">{t("loading")}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{t(error)}</p>}
      {!thread && error === "failed" && <button className="mt-3 text-sm text-[#0089bb] underline" onClick={() => { setError(""); setLoading(true); setAttempt(n => n + 1); }}>{t("retry")}</button>}
      {thread && error !== "invalid" && <>
        <h2 className="mt-5 break-words font-semibold">{thread.ticket.subject}</h2>
        <div className="mt-4 space-y-3" aria-label={t("conversation")}>
          {thread.messages.map(message => <article key={message.id} className={`rounded-xl p-4 ${message.sender_role === "user" ? "bg-[#eaf7fc]" : "bg-[#f4f7fa]"}`}>
            <p className="mb-1 text-xs font-semibold">{t(message.sender_role === "user" ? "you" : "team")}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
            <AdjuntosDelMensaje adjuntos={message.attachments} propio={message.sender_role === "user"} />
          </article>)}
        </div>
        <form onSubmit={reply} className="mt-5">
          <label htmlFor="guest-reply" className="block text-sm font-semibold">{t("reply")}</label>
          <textarea id="guest-reply" value={body} onChange={e => { setBody(e.target.value); setSent(false); }} maxLength={LONG_TEXT_MAX_LENGTH} required rows={4} className="mt-2 w-full rounded-xl border border-[#ccd5df] p-3 text-sm" />
          <button disabled={sending || !body.trim()} className="mt-3 rounded-full bg-[#009FD9] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{t(sending ? "sending" : "send")}</button>
          {sent && <p role="status" className="mt-3 text-sm">{t("sent")}</p>}
        </form>
        <p className="mt-5 text-xs text-[#5b6472]">{t("private")}</p>
      </>}
      <Link href={login} className="mt-5 block text-sm text-[#0089bb] underline">{t("login")}</Link>
      {!loading && (!thread || error === "invalid") && <Link href="/soporte" className="mt-3 block text-sm text-[#0089bb] underline">{t("newCase")}</Link>}
    </div>
  </main>;
}
