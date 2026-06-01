"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  cedula: z.string().min(9, "Cédula inválida").max(12, "Cédula inválida"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

export default function RegistroClientePage() {
  const [fullName, setFullName] = useState("");
  const [loadingCedula, setLoadingCedula] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function lookupCedula(cedula: string) {
    if (cedula.length < 9) return;
    setLoadingCedula(true);
    await new Promise((r) => setTimeout(r, 900));
    setFullName("Laura Fernández Arias");
    setLoadingCedula(false);
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSubmitting(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-md text-center">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-[#f0f9f6] mb-5">
              <CheckCircle2 className="h-10 w-10 text-[#319278]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-2">¡Cuenta creada!</h1>
            <p className="text-[#6b7280] mb-6">
              Ya podés buscar y contratar profesionales en tu zona.
            </p>
            <Button size="lg" asChild>
              <Link href="/buscar">Buscar profesionales</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-[#f0f9f6] mb-4">
              <span className="text-3xl">👤</span>
            </div>
            <h1 className="text-2xl font-bold text-[#111827]">Crear cuenta de cliente</h1>
            <p className="text-[#6b7280] text-sm mt-1">Un solo paso. Gratis.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="bg-[#f0f9f6] rounded-2xl p-4 border border-[#bbe2d5]">
              <p className="text-sm text-[#237561] font-medium">
                🔐 Verificamos tu identidad con el Registro Civil
              </p>
            </div>

            <div>
              <Input
                label="Número de cédula"
                placeholder="101230456"
                hint="Para verificar tu identidad"
                error={errors.cedula?.message}
                {...register("cedula")}
                onBlur={(e) => lookupCedula(e.target.value)}
                rightIcon={loadingCedula ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
              />
            </div>

            {fullName && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f0f9f6] border border-[#bbe2d5]">
                <CheckCircle2 className="h-5 w-5 text-[#319278] shrink-0" />
                <div>
                  <p className="text-xs text-[#6b7280]">Nombre verificado</p>
                  <p className="text-sm font-semibold text-[#111827]">{fullName}</p>
                </div>
              </div>
            )}

            <Input
              label="Correo electrónico"
              type="email"
              placeholder="tu@email.com"
              error={errors.email?.message}
              {...register("email")}
            />

            <Input
              label="Contraseña"
              type="password"
              placeholder="Mínimo 8 caracteres"
              error={errors.password?.message}
              {...register("password")}
            />

            <Button type="submit" size="lg" className="mt-2" loading={submitting}>
              {submitting ? "Creando cuenta..." : <>Crear cuenta <ArrowRight className="h-4 w-4" /></>}
            </Button>

            <p className="text-center text-xs text-[#9ca3af]">
              Al registrarte aceptás nuestros{" "}
              <Link href="/terminos" className="text-[#319278] hover:underline">Términos de uso</Link>
            </p>
          </form>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-[#319278] font-medium hover:underline">
              Iniciá sesión
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
