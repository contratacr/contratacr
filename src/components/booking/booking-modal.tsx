"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, CheckCircle2, MapPin, MessageCircle, Shield, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

type BookingStep = "details" | "contact" | "success";

interface BookingModalProps {
  professional: ProfessionalCardData;
  categoryName: string;
  open: boolean;
  onClose: () => void;
}

export function BookingModal({ professional, categoryName, open, onClose }: BookingModalProps) {
  const t = useTranslations("booking");

  const [step, setStep] = useState<BookingStep>("details");
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waLink, setWaLink] = useState("");

  // Fetch current user on open
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setIsLoggedIn(true);
        const name =
          (user.user_metadata?.full_name as string) ||
          (user.user_metadata?.name as string) ||
          "";
        setClientName(name);
        setClientEmail(user.email ?? "");
      } else {
        setIsLoggedIn(false);
      }
    });
  }, [open]);

  function resetAndClose() {
    setStep("details");
    setDescription("");
    setPreferredDate("");
    setWaLink("");
    onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: professional.id,
          clientName: clientName || "Cliente",
          clientEmail: clientEmail || null,
          serviceDescription: description,
          preferredDateText: preferredDate,
        }),
      });

      const firstName = professional.fullName.split(" ")[0];
      const senderName = clientName.trim() || "un cliente";
      const message = [
        `Hola ${firstName}, soy ${senderName}. Te contacto desde ContrataCR 🔗`,
        ``,
        description ? `📋 Necesito: ${description}` : null,
        preferredDate ? `📅 Cuándo: ${preferredDate}` : null,
        ``,
        `¿Podés ayudarme?`,
      ]
        .filter((l) => l !== null)
        .join("\n");

      setWaLink(getWhatsAppLink(professional.whatsapp, message));
      setStep("success");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[95vw] max-w-3xl rounded-3xl overflow-hidden shadow-2xl",
            "flex flex-col md:flex-row",
            "max-h-[95vh] md:max-h-[600px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2"
          )}
        >
          {/* LEFT PANEL */}
          <div className="bg-gradient-to-br from-[#0c2420] via-[#183f36] to-[#237561] md:w-[280px] shrink-0 flex flex-col p-6 text-white">
            <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-0">
              {/* Avatar — no border/ring */}
              <Avatar className="h-14 w-14 md:h-20 md:w-20 md:self-center shrink-0">
                <AvatarImage src={professional.avatarUrl} alt={professional.fullName} />
                <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
                  {getInitials(professional.fullName)}
                </AvatarFallback>
              </Avatar>

              <div className="md:mt-4 md:text-center md:w-full">
                <div className="flex items-center gap-1.5 md:justify-center flex-wrap">
                  <span className="font-bold text-base md:text-lg leading-tight">{professional.fullName}</span>
                  {professional.isVerified && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-1 mt-1 md:justify-center">
                  <span className="text-sm text-white/70">{categoryName}</span>
                </div>
              </div>
            </div>

            {/* Stats — desktop only */}
            <div className="hidden md:block mt-5 space-y-2">
              <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="sm" className="justify-center [&_span]:text-white [&_.text-\[\#9ca3af\]]:text-white/60" />
              {professional.cantonName && (
                <div className="flex items-center gap-1.5 justify-center text-white/70 text-sm">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{professional.cantonName}, {professional.provinceName}</span>
                </div>
              )}
              {professional.hourlyRate && (
                <div className="text-center">
                  <span className="text-xs text-white/60">Desde</span>
                  <p className="font-bold text-white text-lg">
                    ₡{professional.hourlyRate.toLocaleString("es-CR")}
                    <span className="text-xs font-normal text-white/60">/hora</span>
                  </p>
                </div>
              )}
            </div>

            <div className="hidden md:block mt-5 pt-5 border-t border-white/20">
              <p className="text-sm text-white/70 leading-relaxed line-clamp-4">{professional.bio}</p>
            </div>

            <div className="hidden md:flex flex-col gap-2 mt-auto pt-5">
              {[
                { icon: <Shield className="h-3 w-3" />, text: "Sin comisiones" },
                { icon: <CheckCircle2 className="h-3 w-3" />, text: "Contacto directo" },
                { icon: <MessageCircle className="h-3 w-3" />, text: "Respuesta por WhatsApp" },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-white/60 text-xs">
                  {icon} {text}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 bg-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f3f4f6] shrink-0">
              <div>
                <h2 className="font-bold text-[#111827]">{t("title")}</h2>
                {step !== "success" && (
                  <div className="flex items-center gap-1 mt-1">
                    {(isLoggedIn ? ["details"] : ["details", "contact"]).map((_, n) => (
                      <span
                        key={n}
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-300",
                          n === 0 && step === "details" ? "bg-[#009FD9] w-6"
                            : n === 0 ? "bg-[#009FD9] w-6"
                            : step === "contact" ? "bg-[#009FD9] w-6" : "bg-[#e5e7eb] w-3"
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
              <Dialog.Close asChild>
                <button className="p-2 rounded-xl text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors" aria-label="Cerrar">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">

              {/* STEP: details — what do you need */}
              {step === "details" && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h3 className="text-lg font-semibold text-[#111827]">{t("step4.title")}</h3>
                    {isLoggedIn && clientName && (
                      <p className="text-sm text-[#6b7280] mt-1">
                        Hola, <span className="font-medium text-[#374151]">{clientName.split(" ")[0]}</span>. Describí lo que necesitás y te contactamos con el profesional.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.description")} <span className="text-[#9ca3af] font-normal">(requerido)</span>
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[110px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder={t("step4.descPlaceholder")}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.date")} <span className="text-[#9ca3af] font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder={t("step4.datePlaceholder")}
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                    />
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-xl bg-[#f3f4f6]">
                    <MessageCircle className="h-4 w-4 text-[#25d366] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#6b7280]">{t("step4.note")}</p>
                  </div>
                </div>
              )}

              {/* STEP: contact — name + email (guests only) */}
              {step === "contact" && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-lg font-semibold text-[#111827]">Tu información de contacto</h3>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      Nombre completo
                    </label>
                    <input
                      type="text"
                      className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder="Tu nombre"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.email")} <span className="text-[#9ca3af] font-normal">(opcional)</span>
                    </label>
                    <input
                      type="email"
                      className="w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      placeholder="tu@email.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* SUCCESS */}
              {step === "success" && (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EBF5FB]">
                    <CheckCircle2 className="h-10 w-10 text-[#009FD9]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#111827] mb-2">{t("success.title")}</h3>
                    <p className="text-sm text-[#6b7280] max-w-xs mx-auto">{t("success.desc")}</p>
                  </div>
                  <Button variant="whatsapp" size="lg" asChild className="w-full max-w-xs">
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-5 w-5" />
                      {t("success.whatsapp")}
                    </a>
                  </Button>
                </div>
              )}
            </div>

            {/* Footer actions */}
            {step !== "success" && (
              <div className="px-6 py-4 border-t border-[#f3f4f6] shrink-0 flex gap-3">
                {step === "contact" && (
                  <Button variant="outline" size="md" onClick={() => setStep("details")}>
                    <ArrowLeft className="h-4 w-4" />
                    {t("back")}
                  </Button>
                )}
                <Button
                  size="md"
                  className="flex-1"
                  disabled={step === "details" && !description.trim()}
                  loading={submitting}
                  onClick={async () => {
                    if (step === "details") {
                      if (!description.trim()) return;
                      if (isLoggedIn) {
                        await handleSubmit();
                      } else {
                        setStep("contact");
                      }
                    } else if (step === "contact") {
                      await handleSubmit();
                    }
                  }}
                >
                  {submitting
                    ? "Enviando…"
                    : step === "details" && !isLoggedIn
                    ? t("continue")
                    : t("step4.submit")}
                </Button>
              </div>
            )}

            {step === "success" && (
              <div className="px-6 py-4 border-t border-[#f3f4f6] shrink-0">
                <Button variant="outline" size="md" className="w-full" onClick={resetAndClose}>
                  {t("success.close")}
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
