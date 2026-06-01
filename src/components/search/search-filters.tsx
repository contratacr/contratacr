"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, PROVINCIAS, getCantonsByProvincia } from "@/lib/data/cr-geography";

export function SearchFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const [categoria, setCategoria] = useState(params.get("categoria") ?? "");
  const [provincia, setProvincia] = useState(params.get("provincia") ?? "");
  const [canton, setCanton] = useState(params.get("canton") ?? "");
  const [sortBy, setSortBy] = useState(params.get("sortBy") ?? "rating");

  const cantones = provincia ? getCantonsByProvincia(provincia) : [];

  const apply = useCallback(
    (overrides: Record<string, string> = {}) => {
      const next = new URLSearchParams();
      const vals = { categoria, provincia, canton, sortBy, ...overrides };
      if (vals.categoria) next.set("categoria", vals.categoria);
      if (vals.provincia) next.set("provincia", vals.provincia);
      if (vals.canton && vals.provincia) next.set("canton", vals.canton);
      if (vals.sortBy && vals.sortBy !== "rating") next.set("sortBy", vals.sortBy);
      router.push(`/buscar?${next.toString()}`);
    },
    [categoria, provincia, canton, sortBy, router]
  );

  function clearAll() {
    setCategoria("");
    setProvincia("");
    setCanton("");
    setSortBy("rating");
    router.push("/buscar");
  }

  const activeCount = [categoria, provincia, canton].filter(Boolean).length;

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#6b7280]" />
          <span className="text-sm font-semibold text-[#374151]">Filtros</span>
          {activeCount > 0 && (
            <Badge variant="default" className="text-xs">{activeCount}</Badge>
          )}
        </div>
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-red-500 transition-colors"
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Category */}
        <div className="flex-1">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">Categoría</label>
          <Select
            value={categoria}
            onValueChange={(v) => {
              setCategoria(v);
              apply({ categoria: v });
            }}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Provincia */}
        <div className="sm:w-44">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">Provincia</label>
          <Select
            value={provincia}
            onValueChange={(v) => {
              setProvincia(v);
              setCanton("");
              apply({ provincia: v, canton: "" });
            }}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {PROVINCIAS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Canton */}
        <div className="sm:w-44">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">Cantón</label>
          <Select
            value={canton}
            onValueChange={(v) => {
              setCanton(v);
              apply({ canton: v });
            }}
            disabled={!provincia || cantones.length === 0}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={provincia ? "Todos" : "Seleccioná provincia"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los cantones</SelectItem>
              {cantones.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort */}
        <div className="sm:w-44">
          <label className="text-xs font-medium text-[#6b7280] mb-1.5 block">Ordenar por</label>
          <Select
            value={sortBy}
            onValueChange={(v) => {
              setSortBy(v);
              apply({ sortBy: v });
            }}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">Mejor calificados</SelectItem>
              <SelectItem value="reviews">Más reseñas</SelectItem>
              <SelectItem value="price_asc">Precio: menor a mayor</SelectItem>
              <SelectItem value="price_desc">Precio: mayor a menor</SelectItem>
              <SelectItem value="newest">Más recientes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
