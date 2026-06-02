"use client";

import { useEffect, useState } from "react";
import { Bookmark, MapPin, Star, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { getSavedPros, unsavePro, type SavedPro } from "./save-button";
import { useTranslations } from "next-intl";

function SavedProCard({ pro, onUnsave }: { pro: SavedPro; onUnsave: (id: string) => void }) {
  const tCat = useTranslations("categories");

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
          style={{
            background: pro.avatarUrl
              ? undefined
              : "linear-gradient(135deg, #2563EB, #1d4ed8)",
          }}
        >
          {pro.avatarUrl ? (
            <img src={pro.avatarUrl} alt={pro.fullName} className="w-full h-full object-cover rounded-2xl" />
          ) : (
            pro.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-[#111827] text-sm">{pro.fullName}</span>
          {pro.isVerified && <CheckCircle2 className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-[#6b7280]">
            {pro.categoryIcon} {tCat(pro.categoryId)}
          </span>
          <span className="flex items-center gap-0.5 text-xs text-[#6b7280]">
            <MapPin className="h-3 w-3" />
            {pro.cantonName}, {pro.provinceName}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
          <span className="text-xs text-[#374151] font-medium">{pro.ratingAvg.toFixed(1)}</span>
          <span className="text-xs text-[#9ca3af]">({pro.reviewCount})</span>
          {pro.hourlyRate && (
            <span className="text-xs text-[#9ca3af] ml-2">
              · ₡{pro.hourlyRate.toLocaleString("es-CR")}/hr
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/profesionales/${pro.slug}`}>
            <ExternalLink className="h-3.5 w-3.5" />
            Ver perfil
          </Link>
        </Button>
        <button
          onClick={() => onUnsave(pro.id)}
          aria-label="Quitar de guardados"
          className="p-2 rounded-xl text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Bookmark className="h-4 w-4 fill-current" />
        </button>
      </div>
    </div>
  );
}

export function SavedProfessionalsTab() {
  const [saved, setSaved] = useState<SavedPro[]>([]);
  const [mounted, setMounted] = useState(false);

  function refresh() {
    setSaved(getSavedPros());
  }

  useEffect(() => {
    setMounted(true);
    refresh();
    window.addEventListener("savedProsChanged", refresh);
    return () => window.removeEventListener("savedProsChanged", refresh);
  }, []);

  function handleUnsave(id: string) {
    unsavePro(id);
    setSaved((prev) => prev.filter((p) => p.id !== id));
  }

  if (!mounted) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
      </div>
    );
  }

  if (saved.length === 0) {
    return (
      <div className="text-center py-16">
        <Bookmark className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
        <p className="font-semibold text-[#374151]">No tenés profesionales guardados</p>
        <p className="text-sm text-[#9ca3af] mt-1 max-w-xs mx-auto">
          Guardá profesionales que te interesan con el ícono de marcador en sus tarjetas.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/buscar">Buscar profesionales</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-4">{saved.length} profesional{saved.length !== 1 ? "es" : ""} guardado{saved.length !== 1 ? "s" : ""}</p>
      <div className="flex flex-col gap-3">
        {saved.map((pro) => (
          <SavedProCard key={pro.id} pro={pro} onUnsave={handleUnsave} />
        ))}
      </div>
    </div>
  );
}
