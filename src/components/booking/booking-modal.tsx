"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { X, CheckCircle2, MapPin, Star, Loader2, MessageCircle, Shield, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/star-rating";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

type BookingStep = "who" | "identity" | "verify" | "confirm" | "success";
type ForWhom = "self" | "other";

interface BookingModalProps {
  professional: ProfessionalCardData;
  categoryName: string;
  open: boolean;
  onClose: () => void;
}

const TOTAL_STEPS = 4;
const STEP_INDEX: Record<BookingStep, number> = {
  who: 1,
  identity: 2,
  verify: 3,
  confirm: 4,
  success: 4,
};

export function BookingModal({ professional, categoryName, open, onClose }: BookingModalProps) {
  const t = useTranslations("booking");

  const [step, setStep] = useState<BookingStep>("who");
  const [forWhom, setForWhom] = useState<ForWhom>("self");
  const [cedula, setCedula] = useState("");
  const [fullName, setFullName] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [waLink, setWaLink] = useState("");

  function resetAndClose() {
    setStep("who");
    setForWhom("self");
    setCedula("");
    setFullName("");
    setLookupError("");
    setDescription("");
    setPreferredDate("");
    setEmail("");
    setWaLink("");
    onClose();
  }

  async function handleVerifyCedula() {
    if (!cedula || cedula.length < 9) return;
    setVerifying(true);
    setLookupError("");
    try {
      const res = await fetch(`/api/cedula/${cedula}`);
      if (!res.ok) {
        setLookupError(t("step2.notFound"));
        return;
      }
      const data = await res.json();
      setFullName(data.fullName);
      setStep("verify");
    } catch {
      setLookupError(t("step2.notFound"));
    } finally {
      setVerifying(false);
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId: professional.id,
          clientCedula: cedula,
          clientName: fullName,
          clientEmail: email || null,
          serviceDescription: description,
          preferredDateText: preferredDate,
        }),
      });

      const firstName = professional.fullName.split(" ")[0];
      const message = [
        `Hola ${firstName}, soy ${fullName}. Te contacto desde ContrataCR 🔗`,
        ``,
        `📋 Necesito: ${description}`,
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

  const currentStepIndex = STEP_INDEX[step];

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[95vw] max-w-3xl rounded-3xl overflow-hidden shadow-2xl",
            "flex flex-col md:flex-row",
            "max-h-[95vh] md:max-h-[640px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2"
          )}
        >
          {/* LEFT PANEL */}
          <div className="bg-gradient-to-br from-[#0c2420] via-[#183f36] to-[#237561] md:w-[300px] shrink-0 flex flex-col p-6 text-white">
            {/* Mobile: compact header */}
            <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-0">
              <Avatar className="h-14 w-14 md:h-20 md:w-20 ring-2 ring-white/30 md:self-center shrink-0">
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
                  <span className="text-sm text-white/70">{professional.categoryIcon} {categoryName}</span>
                </div>
              </div>
            </div>

            {/* Stats — hidden on mobile */}
            <div className="hidden md:block mt-5 space-y-2">
              <StarRating rating={professional.ratingAvg} showValue reviewCount={professional.reviewCount} size="sm" className="justify-center [&_span]:text-white [&_.text-\[\#9ca3af\]]:text-white/60" />

              <div className="flex items-center gap-1.5 justify-center text-white/70 text-sm">
                <MapPin className="h-3.5 w-3.5" />
                <span>{professional.cantonName}, {professional.provinceName}</span>
              </div>

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

            {/* Divider + bio — hidden on mobile */}
            <div className="hidden md:block mt-5 pt-5 border-t border-white/20">
              <p className="text-sm text-white/70 leading-relaxed line-clamp-4">{professional.bio}</p>
            </div>

            {/* Trust signals — hidden on mobile */}
            <div className="hidden md:flex flex-col gap-2 mt-auto pt-5">
              {[
                { icon: <Shield className="h-3 w-3" />, text: "Identidad verificada" },
                { icon: <CheckCircle2 className="h-3 w-3" />, text: "Sin comisiones" },
                { icon: <MessageCircle className="h-3 w-3" />, text: "Contacto directo WhatsApp" },
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
                    {[1, 2, 3, 4].map((n) => (
                      <span
                        key={n}
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-300",
                          n <= currentStepIndex ? "bg-[#319278] w-6" : "bg-[#e5e7eb] w-3"
                        )}
                      />
                    ))}
                    <span className="text-xs text-[#9ca3af] ml-2">
                      {currentStepIndex}/{TOTAL_STEPS}
                    </span>
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

              {/* STEP 1 — Who */}
              {step === "who" && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-lg font-semibold text-[#111827]">{t("step1.title")}</h3>
                  <RadioGroup.Root
                    value={forWhom}
                    onValueChange={(v) => setForWhom(v as ForWhom)}
                    className="flex flex-col gap-3"
                  >
                    {(["self", "other"] as const).map((option) => (
                      <RadioGroup.Item key={option} value={option} asChild>
                        <label className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                          forWhom === option
                            ? "border-[#319278] bg-[#f0f9f6]"
                            : "border-[#e5e7eb] hover:border-[#bbe2d5]"
                        )}>
                          <div className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 transition-all",
                            forWhom === option ? "border-[#319278]" : "border-[#d1d5db]"
                          )}>
                            {forWhom === option && (
                              <div className="h-2.5 w-2.5 rounded-full bg-[#319278]" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-[#111827]">
                              {option === "self" ? t("step1.forMe") : t("step1.forOther")}
                            </p>
                          </div>
                        </label>
                      </RadioGroup.Item>
                    ))}
                  </RadioGroup.Root>
                </div>
              )}

              {/* STEP 2 — Identity */}
              {step === "identity" && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-lg font-semibold text-[#111827]">{t("step2.title")}</h3>
                  <div className="bg-[#f0f9f6] rounded-2xl p-4 border border-[#bbe2d5]">
                    <p className="text-sm text-[#237561] font-medium">
                      🏛️ {t("step3.source")}
                    </p>
                  </div>
                  <Input
                    label={t("step2.cedula")}
                    placeholder={t("step2.cedulaPlaceholder")}
                    hint={t("step2.cedulaHint")}
                    value={cedula}
                    onChange={(e) => { setCedula(e.target.value); setLookupError(""); }}
                    error={lookupError}
                    inputMode="numeric"
                  />
                  {fullName && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f0f9f6] border border-[#bbe2d5]">
                      <CheckCircle2 className="h-5 w-5 text-[#319278] shrink-0" />
                      <div>
                        <p className="text-xs text-[#6b7280]">Nombre verificado</p>
                        <p className="text-sm font-semibold text-[#111827]">{fullName}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3 — Verify */}
              {step === "verify" && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-lg font-semibold text-[#111827]">{t("step3.title")}</h3>

                  <div className="rounded-2xl border-2 border-[#319278] bg-[#f0f9f6] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">🏛️</span>
                      <p className="text-xs font-semibold text-[#319278] uppercase tracking-wide">
                        {t("step3.source")}
                      </p>
                    </div>
                    <p className="text-xs text-[#6b7280] mb-1">{t("step3.name")}</p>
                    <p className="text-xl font-bold text-[#111827]">{fullName}</p>
                    <p className="text-xs text-[#9ca3af] mt-2">Cédula: {cedula}</p>
                  </div>

                  <p className="text-sm font-medium text-[#374151]">{t("step3.correct")}</p>
                </div>
              )}

              {/* STEP 4 — Confirm */}
              {step === "confirm" && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-semibold text-[#111827]">{t("step4.title")}</h3>

                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">
                      {t("step4.description")}
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-[#319278] focus:border-transparent transition-all"
                      placeholder={t("step4.descPlaceholder")}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <Input
                    label={t("step4.date")}
                    placeholder={t("step4.datePlaceholder")}
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                  />

                  <Input
                    label={t("step4.email")}
                    type="email"
                    placeholder="tu@email.com"
                    hint={t("step4.emailHint")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <div className="flex items-start gap-2 p-3 rounded-xl bg-[#f3f4f6]">
                    <MessageCircle className="h-4 w-4 text-[#25d366] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#6b7280]">{t("step4.note")}</p>
                  </div>
                </div>
              )}

              {/* SUCCESS */}
              {step === "success" && (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f0f9f6]">
                    <CheckCircle2 className="h-10 w-10 text-[#319278]" />
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
                {step !== "who" ? (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      if (step === "identity") setStep("who");
                      else if (step === "verify") { setStep("identity"); setFullName(""); }
                      else if (step === "confirm") setStep("verify");
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("back")}
                  </Button>
                ) : null}

                <Button
                  size="md"
                  className="flex-1"
                  disabled={step === "identity" && (!cedula || cedula.length < 9)}
                  loading={step === "identity" ? verifying : step === "confirm" ? submitting : false}
                  onClick={async () => {
                    if (step === "who") setStep("identity");
                    else if (step === "identity") await handleVerifyCedula();
                    else if (step === "verify") setStep("confirm");
                    else if (step === "confirm") await handleConfirm();
                  }}
                >
                  {step === "identity"
                    ? verifying ? t("step2.verifying") : t("step2.verify")
                    : step === "verify"
                    ? t("step3.yes")
                    : step === "confirm"
                    ? submitting ? "Enviando..." : t("step4.submit")
                    : t("continue")}
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

            {step === "verify" && (
              <div className="px-6 pb-2 shrink-0 text-center">
                <button
                  className="text-xs text-[#6b7280] hover:text-red-500 transition-colors"
                  onClick={() => { setStep("identity"); setFullName(""); setCedula(""); }}
                >
                  {t("step3.no")}
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
