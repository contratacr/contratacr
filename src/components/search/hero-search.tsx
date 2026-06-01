"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Search, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, PROVINCES } from "@/lib/data/cr-geography";

export function HeroSearch() {
  const router = useRouter();
  const t = useTranslations();
  const [category, setCategory] = useState("");
  const [province, setProvince] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (category) params.set("categoria", category);
    if (province) params.set("provincia", province);
    router.push(`/buscar?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSearch} className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-[#e5e7eb] p-3 flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-12 rounded-xl border-0 bg-[#f3f4f6] focus:ring-0 text-sm">
              <div className="flex items-center gap-2 text-[#6b7280]">
                <Search className="h-4 w-4 shrink-0" />
                <SelectValue placeholder={t("hero.categoryPlaceholder")} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon} {t(`categories.${cat.id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden sm:block w-px bg-[#e5e7eb] my-1" />

        <div className="sm:w-44">
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger className="h-12 rounded-xl border-0 bg-[#f3f4f6] focus:ring-0 text-sm">
              <div className="flex items-center gap-2 text-[#6b7280]">
                <MapPin className="h-4 w-4 shrink-0" />
                <SelectValue placeholder={t("hero.provincePlaceholder")} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" size="lg" className="h-12 px-8 shrink-0">
          {t("hero.searchButton")}
        </Button>
      </div>
    </form>
  );
}
