"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PriceInput } from "@/components/ui/price-input";
import { Button } from "@/components/ui/button";
import { STARTING_PRICE_ID, formatPricingTier, startingPriceOf, type PricingTier, type PricingType } from "@/lib/pricing";

/**
 * El precio de entrada del perfil: el mínimo por el que el profesional sale a
 * trabajar (visita, hora o trabajo mínimo). Vive en professionals.pricing y
 * las tarjetas lo muestran como "Desde ₡X" cuando no hay precios por servicio.
 * No obliga a tocar los servicios ya cargados: es un solo dato.
 */
const TIPOS: PricingType[] = ["por_consulta", "por_hora", "por_proyecto"];

export function StartingPriceEditor({ professionalId, initialPricing, onSaved }: { professionalId: string; initialPricing?: PricingTier[] | null; onSaved?: () => void }) {
  const t = useTranslations("proPanel.startingPrice");
  const locale = useLocale();
  const actual = startingPriceOf(initialPricing);
  const [type, setType] = useState<PricingType>(actual?.type && TIPOS.includes(actual.type) ? actual.type : "por_consulta");
  const [amount, setAmount] = useState(actual?.amount ? String(actual.amount) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monto = Number(amount.replace(/\D/g, ""));
  const preview = monto > 0 ? formatPricingTier({ id: STARTING_PRICE_ID, type, amount: monto }, locale) : null;

  async function guardar(quitar = false) {
    setSaving(true); setError(null);
    try {
      const otros = (initialPricing ?? []).filter((tier) => tier.id !== STARTING_PRICE_ID);
      const pricing = quitar || !(monto > 0) ? otros : [{ id: STARTING_PRICE_ID, type, amount: monto }, ...otros];
      const { error: err } = await createClient().from("professionals").update({ pricing }).eq("id", professionalId);
      if (err) throw err;
      if (quitar) setAmount("");
      setSaved(true); window.setTimeout(() => setSaved(false), 2500);
      onSaved?.();
    } catch (err) {
      console.error("[starting-price] save failed", err);
      setError(t("error"));
    } finally { setSaving(false); }
  }

  return (
    <section className="rounded-2xl border border-[#e5eaf0] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[#009FD9]"><Tag className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-extrabold text-[#162543]">{t("title")}</h2>
          <p className="mt-1 text-[13px] leading-5 text-[#52627a]">{t("body")}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-[13px] font-bold text-[#162543]">{t("typeLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((tipo) => (
            <button key={tipo} type="button" onClick={() => setType(tipo)} className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-bold transition-colors ${type === tipo ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#d7e1ea] bg-white text-[#162543] hover:border-[#009FD9]"}`}>
              {t(`type_${tipo}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-bold text-[#162543]">{t("amountLabel")}</span>
          <PriceInput value={amount} onChange={setAmount} placeholder={t("amountPlaceholder")} colonPrefix suffix="I.V.A.I." />
        </label>
        <div className="flex gap-2">
          <Button type="button" className="h-11 flex-1 sm:w-44" disabled={saving || !(monto > 0)} loading={saving} onClick={() => void guardar()}>{saving ? t("saving") : saved ? t("saved") : t("save")}</Button>
          {actual && <Button type="button" variant="secondary" className="h-11" disabled={saving} onClick={() => void guardar(true)}>{t("remove")}</Button>}
        </div>
      </div>
      {preview && <p className="mt-3 text-[13px] text-[#52627a]">{t("preview", { label: preview })}</p>}
      {error && <p className="mt-2 text-[13px] font-semibold text-red-600">{error}</p>}
    </section>
  );
}
