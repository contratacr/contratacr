"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface ProfileEditorProps {
  professionalId: string;
  initial: {
    bio: string;
    whatsapp: string;
    hourlyRate?: number;
    yearsExperience?: number;
  };
}

export function ProfileEditor({ professionalId, initial }: ProfileEditorProps) {
  const t = useTranslations("dashboard.pro.profile");
  const [bio, setBio] = useState(initial.bio);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [hourlyRate, setHourlyRate] = useState(String(initial.hourlyRate ?? ""));
  const [yearsExp, setYearsExp] = useState(String(initial.yearsExperience ?? ""));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("professionals")
      .update({
        bio,
        whatsapp,
        hourly_rate: hourlyRate ? Number(hourlyRate) : null,
        years_experience: yearsExp ? Number(yearsExp) : null,
      })
      .eq("id", professionalId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <div>
        <label className="text-sm font-medium text-[#374151] block mb-1.5">{t("bio")}</label>
        <textarea
          className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-[#319278] focus:border-transparent transition-all"
          placeholder={t("bioPlaceholder")}
          value={bio}
          onChange={(e) => { setBio(e.target.value); setSaved(false); }}
        />
      </div>

      <Input
        label={t("whatsapp")}
        placeholder="88001122"
        value={whatsapp}
        onChange={(e) => { setWhatsapp(e.target.value); setSaved(false); }}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label={t("rate")}
          type="number"
          placeholder="10000"
          value={hourlyRate}
          onChange={(e) => { setHourlyRate(e.target.value); setSaved(false); }}
        />
        <Input
          label={t("yearsExp")}
          type="number"
          placeholder="5"
          value={yearsExp}
          onChange={(e) => { setYearsExp(e.target.value); setSaved(false); }}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">✓ {t("saved")}</span>
        )}
      </div>
    </div>
  );
}
