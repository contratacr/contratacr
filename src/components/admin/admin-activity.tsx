import { UserPlus, Users, Briefcase, FolderOpen, LifeBuoy } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { ActivityEvent, ActivityKind } from "@/lib/admin/activity";

const META: Record<ActivityKind, { icon: typeof UserPlus; bg: string; fg: string; tag: string }> = {
  pro: { icon: UserPlus, bg: "bg-[#e0f2fe]", fg: "text-[#0369a1]", tag: "Profesional" },
  client: { icon: Users, bg: "bg-[#dcfce7]", fg: "text-[#15803d]", tag: "Cliente" },
  solicitud: { icon: Briefcase, bg: "bg-[#ede9fe]", fg: "text-[#6d28d9]", tag: "Solicitud" },
  proyecto: { icon: FolderOpen, bg: "bg-[#fef3c7]", fg: "text-[#b45309]", tag: "Proyecto" },
  ticket: { icon: LifeBuoy, bg: "bg-[#fee2e2]", fg: "text-[#b91c1c]", tag: "Soporte" },
};

export function AdminActivity({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Actividad</h1>
        <p className="mt-0.5 text-sm text-[#64748b]">Eventos recientes en la plataforma (altas, solicitudes, proyectos y soporte).</p>
      </div>

      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
        {events.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl bg-[#f8fafc] py-12 text-sm text-[#94a3b8]">Sin actividad aún</div>
        ) : (
          <div className="flex flex-col divide-y divide-[#f1f5f9]">
            {events.map((e) => {
              const m = META[e.kind];
              return (
                <div key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${m.bg} ${m.fg}`}><m.icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0f172a]">{e.title}</p>
                    <p className="truncate text-xs text-[#64748b]">{e.sub}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.bg} ${m.fg}`}>{m.tag}</span>
                  <span className="hidden shrink-0 w-20 text-right text-xs text-[#94a3b8] sm:inline">{formatRelativeTime(e.createdAt, "es")}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
