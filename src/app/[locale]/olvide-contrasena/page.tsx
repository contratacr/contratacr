"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";

const schema = z.object({
  email: z.string().email("Email inválido"),
});

type FormData = z.infer<typeof schema>;

export default function OlvideContrasenaPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: window.location.origin + "/auth/callback",
    });
    setSubmitting(false);
    if (resetError) {
      setError("Ocurrió un error. Verificá el correo e intentá de nuevo.");
      return;
    }
    setSuccess(true);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <ContrataCRLogo className="justify-center mb-4" />
            <h1 className="text-2xl font-bold text-[#111827]">Olvidé mi contraseña</h1>
            <p className="text-[#6b7280] text-sm mt-1">
              Ingresá tu correo y te enviamos un enlace para restablecer tu contraseña.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {success ? (
            <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>Te enviamos un correo para restablecer tu contraseña.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <Input
                label="Correo electrónico"
                type="email"
                placeholder="tu@email.com"
                error={errors.email?.message}
                {...register("email")}
              />
              <Button type="submit" size="lg" loading={submitting} className="mt-2">
                {submitting ? "Enviando…" : <>Enviar enlace <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-[#6b7280] mt-6">
            <Link href="/login" className="text-[#009FD9] font-medium hover:underline">
              Volver al inicio de sesión
            </Link>
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
