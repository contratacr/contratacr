import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_CATEGORIES } from "@/lib/data/categories";
import { PROVINCES } from "@/lib/data/cr-geography";

// GET /api/admin/coverage — where the supply actually is.
//
//  • services:  every catalog service with how many professionals offer it
//               (primary category or any secondary profession) and how many of
//               those are verified.
//  • groups:    the same rolled up per catalogue group.
//  • provinces: every province and every canton of Costa Rica — even the ones
//               with nobody — with professionals *based* there and professionals
//               *serving* there (their coverage areas include it).
//
// Computed from the professionals table in one pass; nothing is persisted.

type ProfessionalRow = {
  id: string;
  category_id: string | null;
  professions: string[] | null;
  provincia_id: string | null;
  canton_id: string | null;
  search_provincias: string[] | null;
  search_cantones: string[] | null;
  coverage_country: boolean | null;
  verification_status: string | null;
  is_banned: boolean | null;
};

type CategoryRow = { id: string; name: string | null; name_en: string | null; group_id: string | null; is_hidden: boolean | null };
type GroupRow = { id: string; label: string | null; sort_order: number | null; is_hidden: boolean | null };

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = createAdminClient();
  const [prosRes, categoriesRes, groupsRes] = await Promise.all([
    db
      .from("professionals")
      .select("id, category_id, professions, provincia_id, canton_id, search_provincias, search_cantones, coverage_country, verification_status, is_banned"),
    db.from("categories").select("id, name, name_en, group_id, is_hidden"),
    db.from("category_groups").select("id, label, sort_order, is_hidden"),
  ]);

  if (prosRes.error) {
    console.error("[admin/coverage] professionals", prosRes.error.message);
    return NextResponse.json({ error: "No se pudo calcular la cobertura." }, { status: 500 });
  }

  const pros = (prosRes.data ?? []) as ProfessionalRow[];
  const active = pros.filter((p) => !p.is_banned);
  const isVerified = (p: ProfessionalRow) => p.verification_status === "verified";

  // ── Services ──
  const dbCategories = new Map(((categoriesRes.data ?? []) as CategoryRow[]).map((row) => [row.id, row]));
  const groupLabels = new Map<string, { label: string; sortOrder: number }>();
  for (const group of (groupsRes.data ?? []) as GroupRow[]) {
    if (group.is_hidden) continue;
    groupLabels.set(group.id, { label: group.label || group.id, sortOrder: group.sort_order ?? 100 });
  }
  const serviceMeta = new Map<string, { label: string; groupId: string; groupLabel: string; source: "base" | "custom" }>();
  for (const category of ALL_CATEGORIES) {
    const row = dbCategories.get(category.id);
    if (row?.is_hidden) continue;
    const groupId = row?.group_id || category.groupId;
    serviceMeta.set(category.id, { label: row?.name || category.label, groupId, groupLabel: groupLabels.get(groupId)?.label || category.groupLabel, source: "base" });
  }
  for (const row of dbCategories.values()) {
    if (serviceMeta.has(row.id) || row.is_hidden) continue;
    const groupId = row.group_id || "otras";
    serviceMeta.set(row.id, { label: row.name || row.id, groupId, groupLabel: groupLabels.get(groupId)?.label || "Otras", source: "custom" });
  }

  const perService = new Map<string, { total: number; verified: number }>();
  const bump = (id: string | null | undefined, verified: boolean) => {
    if (!id) return;
    const entry = perService.get(id) ?? { total: 0, verified: 0 };
    entry.total += 1;
    if (verified) entry.verified += 1;
    perService.set(id, entry);
  };
  for (const p of active) {
    const ids = new Set<string>();
    if (p.category_id) ids.add(p.category_id);
    for (const id of p.professions ?? []) if (id) ids.add(id);
    for (const id of ids) bump(id, isVerified(p));
  }

  const services = [...serviceMeta.entries()]
    .map(([id, meta]) => ({ id, ...meta, professionals: perService.get(id)?.total ?? 0, verified: perService.get(id)?.verified ?? 0 }))
    .sort((a, b) => b.professionals - a.professionals || a.label.localeCompare(b.label, "es"));
  // Services professionals chose that are no longer in the catalogue still count.
  for (const [id, entry] of perService) {
    if (!serviceMeta.has(id)) services.push({ id, label: id, groupId: "otras", groupLabel: "Fuera del catálogo", source: "custom", professionals: entry.total, verified: entry.verified });
  }

  const groupTotals = new Map<string, { id: string; label: string; sortOrder: number; services: number; withProfessionals: number; professionals: number }>();
  for (const service of services) {
    const entry = groupTotals.get(service.groupId) ?? {
      id: service.groupId,
      label: service.groupLabel,
      sortOrder: groupLabels.get(service.groupId)?.sortOrder ?? 100,
      services: 0,
      withProfessionals: 0,
      professionals: 0,
    };
    entry.services += 1;
    if (service.professionals > 0) entry.withProfessionals += 1;
    entry.professionals += service.professionals;
    groupTotals.set(service.groupId, entry);
  }
  const groups = [...groupTotals.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "es"));

  // ── Provinces and cantons ──
  const basedProvince = new Map<string, number>();
  const basedCanton = new Map<string, number>();
  const servingProvince = new Map<string, number>();
  const servingCanton = new Map<string, number>();
  let nationwide = 0;
  const add = (map: Map<string, number>, key: string | null | undefined) => {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const p of active) {
    add(basedProvince, p.provincia_id);
    add(basedCanton, p.canton_id);
    if (p.coverage_country) nationwide += 1;
    for (const id of new Set(p.search_provincias ?? [])) add(servingProvince, id);
    for (const id of new Set(p.search_cantones ?? [])) add(servingCanton, id);
  }

  const provinces = PROVINCES.map((province) => ({
    id: province.id,
    name: province.name,
    based: basedProvince.get(province.id) ?? 0,
    serving: (servingProvince.get(province.id) ?? 0) + nationwide,
    cantons: province.cantons
      .map((canton) => ({
        id: canton.id,
        name: canton.name,
        based: basedCanton.get(canton.id) ?? 0,
        serving: (servingCanton.get(canton.id) ?? 0) + nationwide,
      }))
      .sort((a, b) => b.based - a.based || b.serving - a.serving || a.name.localeCompare(b.name, "es")),
  })).sort((a, b) => b.based - a.based || a.name.localeCompare(b.name, "es"));

  const totalCantons = PROVINCES.reduce((sum, province) => sum + province.cantons.length, 0);
  const cantonsWithSupply = provinces.reduce((sum, province) => sum + province.cantons.filter((c) => c.based > 0).length, 0);
  const cantonsServed = provinces.reduce((sum, province) => sum + province.cantons.filter((c) => c.serving > 0).length, 0);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totals: {
      professionals: active.length,
      verified: active.filter(isVerified).length,
      nationwide,
      services: services.length,
      servicesWithProfessionals: services.filter((s) => s.professionals > 0).length,
      provincesWithSupply: provinces.filter((p) => p.based > 0).length,
      cantons: totalCantons,
      cantonsWithSupply,
      cantonsServed,
    },
    services,
    groups,
    provinces,
  });
}
