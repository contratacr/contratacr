"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, PROVINCIAS, getCantonsByProvincia } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";

const STEPS = ["Identidad", "Servicio", "Perfil"];

const step1Schema = z.object({
  cedula: z.string().min(9, "Cédula inválida").max(12, "Cédula inválida"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

const step2Schema = z.object({
  categoria: z.string().min(1, "Seleccioná una categoría"),
  provincia: z.string().min(1, "Seleccioná una provincia"),
  canton: z.string().min(1, "Seleccioná un cantón"),
  whatsapp: z.string().min(8, "Número inválido").max(12, "Número inválido"),
});

const step3Schema = z.object({
  bio: z.string().min(30, "Mínimo 30 caracteres").max(500, "Máximo 500 caracteres"),
  years_experience: z.string().optional(),
  hourly_rate: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
              i < current
                ? "bg-[#319278] text-white"
                : i === current
                ? "bg-[#319278] text-white ring-4 ring-[#319278]/20"
                : "bg-[#e5e7eb] text-[#9ca3af]"
            )}
          >
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-sm font-medium hidden sm:block",
              i === current ? "text-[#319278]" : "text-[#9ca3af]"
            )}
          >
            {label}
          </span>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "h-px w-8 sm:w-12 transition-all",
                i < current ? "bg-[#319278]" : "bg-[#e5e7eb]"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function RegistroProfesionalPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [loadingCedula, setLoadingCedula] = useState(false);
  const [formData, setFormData] = useState<Partial<Step1Data & Step2Data & Step3Data>>({});

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  const [provincia, setProvincia] = useState("");
  const cantones = getCantonsByProvincia(provincia);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function lookupCedula(cedula: string) {
    if (cedula.length < 9) return;
    setLoadingCedula(true);
    await new Promise((r) => setTimeout(r, 900));
    // Mock: Registro Civil lookup
    const mockNames: Record<string, string> = {
      "101234567": "Mario Alberto Vargas Solano",
      "102345678": "Ana Gabriela Rodríguez Mora",
      "103456789": "Carlos Andrés Jiménez Ulate",
    };
    setFullName(mockNames[cedula] ?? "Juan Carlos Pérez González");
    setLoadingCedula(false);
  }

  async function onStep1(data: Step1Data) {
    setFormData((prev) => ({ ...prev, ...data }));
    setStep(1);
  }

  async function onStep2(data: Step2Data) {
    setFormData((prev) => ({ ...prev, ...data }));
    setStep(2);
  }

  async function onStep3(data: Step3Data) {
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
            <h1 className="text-2xl font-bold text-[#111827] mb-2">¡Perfil creado!</h1>
            <p className="text-[#6b7280] mb-6">
              Tu perfil está listo. En breve aparecerá en los resultados de búsqueda.
            </p>
            <Button size="lg" asChild>
              <Link href="/buscar">Ver mi perfil público</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 py-10 px-4">
        <div className="mx-auto max-w-lg">
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold text-[#111827]">Registrar mi perfil profesional</h1>
            <p className="text-[#6b7280] text-sm mt-1">Gratis. En 3 pasos. Sin tarjeta de crédito.</p>
          </div>

          <StepIndicator current={step} steps={STEPS} />

          {/* Step 1 — Identity */}
          {step === 0 && (
            <form onSubmit={form1.handleSubmit(onStep1)} className="flex flex-col gap-4">
              <div className="bg-[#f0f9f6] rounded-2xl p-4 border border-[#bbe2d5]">
                <p className="text-sm text-[#237561] font-medium">
                  🔐 Verificamos tu identidad con el Registro Civil de Costa Rica
                </p>
              </div>

              <div>
                <Input
                  label="Número de cédula"
                  placeholder="101230456"
                  hint="Ingresá tu cédula para verificar tu identidad automáticamente"
                  error={form1.formState.errors.cedula?.message}
                  {...form1.register("cedula")}
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
                error={form1.formState.errors.email?.message}
                {...form1.register("email")}
              />

              <Input
                label="Contraseña"
                type="password"
                placeholder="Mínimo 8 caracteres"
                hint="Usá una combinación de letras y números"
                error={form1.formState.errors.password?.message}
                {...form1.register("password")}
              />

              <Button type="submit" size="lg" className="mt-2">
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-center text-xs text-[#9ca3af]">
                Al registrarte aceptás nuestros{" "}
                <Link href="/terminos" className="text-[#319278] hover:underline">Términos de uso</Link>
              </p>
            </form>
          )}

          {/* Step 2 — Service */}
          {step === 1 && (
            <form onSubmit={form2.handleSubmit(onStep2)} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  Categoría de servicio
                </label>
                <Select
                  onValueChange={(v) => form2.setValue("categoria", v)}
                >
                  <SelectTrigger className={form2.formState.errors.categoria ? "border-red-400" : ""}>
                    <SelectValue placeholder="Seleccioná tu especialidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form2.formState.errors.categoria && (
                  <p className="text-xs text-red-500 mt-1">{form2.formState.errors.categoria.message}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">Provincia</label>
                <Select
                  onValueChange={(v) => {
                    setProvincia(v);
                    form2.setValue("provincia", v);
                    form2.setValue("canton", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná tu provincia" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCIAS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">Cantón</label>
                <Select
                  disabled={!provincia}
                  onValueChange={(v) => form2.setValue("canton", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={provincia ? "Seleccioná tu cantón" : "Primero seleccioná provincia"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cantones.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Input
                label="WhatsApp"
                placeholder="88001122"
                hint="Número de 8 dígitos. Los clientes te contactarán aquí."
                error={form2.formState.errors.whatsapp?.message}
                {...form2.register("whatsapp")}
              />

              <div className="flex gap-3 mt-2">
                <Button variant="outline" size="lg" type="button" onClick={() => setStep(0)}>
                  <ArrowLeft className="h-4 w-4" /> Atrás
                </Button>
                <Button type="submit" size="lg" className="flex-1">
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {/* Step 3 — Profile */}
          {step === 2 && (
            <form onSubmit={form3.handleSubmit(onStep3)} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  Descripción de tus servicios
                  <span className="text-[#9ca3af] font-normal ml-1">(mínimo 30 caracteres)</span>
                </label>
                <textarea
                  className={cn(
                    "w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none",
                    "border-[#e5e7eb] transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-[#319278] focus:border-transparent",
                    form3.formState.errors.bio && "border-red-400"
                  )}
                  placeholder="Describí tus servicios, experiencia y lo que te diferencia de otros profesionales..."
                  {...form3.register("bio")}
                />
                {form3.formState.errors.bio && (
                  <p className="text-xs text-red-500 mt-1">{form3.formState.errors.bio.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Años de experiencia"
                  type="number"
                  placeholder="Ej: 5"
                  error={form3.formState.errors.years_experience?.message}
                  {...form3.register("years_experience")}
                />
                <Input
                  label="Tarifa por hora (₡)"
                  type="number"
                  placeholder="Ej: 10000"
                  hint="Opcional"
                  {...form3.register("hourly_rate")}
                />
              </div>

              <div className="bg-[#f3f4f6] rounded-2xl p-4">
                <p className="text-xs text-[#6b7280] font-medium mb-2">Podés agregar después:</p>
                <div className="flex flex-wrap gap-2">
                  {["📸 Fotos de trabajos", "🗺️ Zona de cobertura", "📅 Disponibilidad"].map((item) => (
                    <Badge key={item} variant="muted">{item}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <Button variant="outline" size="lg" type="button" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Atrás
                </Button>
                <Button type="submit" size="lg" className="flex-1" loading={submitting}>
                  {submitting ? "Creando perfil..." : "Crear mi perfil gratis"}
                </Button>
              </div>
            </form>
          )}

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
