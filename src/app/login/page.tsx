"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-[#319278] mb-4">
              <span className="text-white font-bold text-xl">C</span>
            </div>
            <h1 className="text-2xl font-bold text-[#111827]">Bienvenido de vuelta</h1>
            <p className="text-[#6b7280] text-sm mt-1">Ingresá a tu cuenta</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label="Correo electrónico"
              type="email"
              placeholder="tu@email.com"
              error={errors.email?.message}
              {...register("email")}
            />

            <div>
              <Input
                label="Contraseña"
                type="password"
                placeholder="Tu contraseña"
                error={errors.password?.message}
                {...register("password")}
              />
              <div className="flex justify-end mt-1">
                <Link href="/olvide-contrasena" className="text-xs text-[#319278] hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            <Button type="submit" size="lg" loading={submitting} className="mt-2">
              {submitting ? "Ingresando..." : <>Ingresar <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e5e7eb]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#fafafa] px-4 text-xs text-[#9ca3af]">o</span>
            </div>
          </div>

          <p className="text-center text-sm text-[#6b7280]">
            ¿No tenés cuenta?{" "}
            <Link href="/registro" className="text-[#319278] font-medium hover:underline">
              Registrate gratis
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
