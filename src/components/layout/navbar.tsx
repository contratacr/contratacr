"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#e5e7eb] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#319278]">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-[#111827] text-lg">
              Contrata<span className="text-[#319278]">CR</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/buscar" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors font-medium">
              Buscar
            </Link>
            <Link href="/categorias" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors font-medium">
              Categorías
            </Link>
            <Link href="/como-funciona" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors font-medium">
              ¿Cómo funciona?
            </Link>
          </nav>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/registro">Registrarse gratis</Link>
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-xl text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
            aria-label="Menú"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "md:hidden border-t border-[#e5e7eb] bg-white overflow-hidden transition-all duration-200",
          open ? "max-h-80" : "max-h-0"
        )}
      >
        <nav className="px-4 py-4 flex flex-col gap-1">
          <Link
            href="/buscar"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#f0f9f6] hover:text-[#319278] transition-colors"
            onClick={() => setOpen(false)}
          >
            <Search className="h-4 w-4" />
            Buscar profesionales
          </Link>
          <Link
            href="/categorias"
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#f0f9f6] hover:text-[#319278] transition-colors"
            onClick={() => setOpen(false)}
          >
            Categorías
          </Link>
          <Link
            href="/como-funciona"
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#f0f9f6] hover:text-[#319278] transition-colors"
            onClick={() => setOpen(false)}
          >
            ¿Cómo funciona?
          </Link>
          <div className="border-t border-[#e5e7eb] my-2" />
          <Link href="/login" onClick={() => setOpen(false)}>
            <Button variant="outline" size="md" className="w-full">
              Iniciar sesión
            </Button>
          </Link>
          <Link href="/registro" onClick={() => setOpen(false)}>
            <Button size="md" className="w-full">
              Registrarse gratis
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
