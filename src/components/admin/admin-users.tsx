"use client";

import { Users } from "lucide-react";
import { AdminUserSearch } from "@/components/admin/admin-user-search";

/* Central "Usuarios" tool — investigate one person end-to-end. This does NOT
   replace the section views (Soporte, Verificaciones, etc.); it complements them
   with a person-centric lookup that opens a consolidated profile. */
export function AdminUsers() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Users className="h-5 w-5 text-[#009FD9]" />
        <h1 className="text-xl font-bold text-[#111827]">Buscar usuario</h1>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 sm:p-6">
        <p className="text-sm text-[#6b7280] mb-3">
          Busca a una persona por <strong>nombre</strong>, <strong>cédula</strong> o <strong>correo</strong> para
          abrir su perfil completo: cuenta, tickets, verificación, reportes, proyectos y solicitudes.
        </p>
        <AdminUserSearch size="lg" autoFocus />
        <p className="text-xs text-[#9ca3af] mt-3">La cédula se muestra enmascarada por privacidad. Escribe al menos 2 caracteres.</p>
      </div>
    </div>
  );
}
