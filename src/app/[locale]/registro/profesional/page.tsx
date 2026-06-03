"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, AlertCircle,
  Eye, EyeOff, Circle, Camera, MapPin, Truck, X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing/landing-footer";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PROVINCES, getCantonsByProvince } from "@/lib/data/cr-geography";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { OtpVerification } from "@/components/auth/otp-verification";
import { useAuth } from "@/hooks/use-auth";

// ─── Services (grouped) ───────────────────────────────────────────────────────

const CATEGORY_GROUPS = [
  {
    label: "Hogar y construcción",
    items: [
      { id: "plomeria", label: "Plomería" },
      { id: "electricidad", label: "Electricidad" },
      { id: "construccion", label: "Construcción" },
      { id: "pintura", label: "Pintura" },
      { id: "carpinteria", label: "Carpintería" },
      { id: "remodelacion", label: "Remodelación" },
      { id: "techos", label: "Techos y cubiertas" },
      { id: "pisos", label: "Pisos y revestimientos" },
      { id: "impermeabilizacion", label: "Impermeabilización" },
      { id: "fumigacion", label: "Fumigación" },
      { id: "cerrajeria", label: "Cerrajería" },
      { id: "aire_acondicionado", label: "Aire acondicionado" },
      { id: "calentadores", label: "Calentadores de agua" },
      { id: "ventanas_puertas", label: "Ventanas y puertas" },
      { id: "soldadura", label: "Soldadura" },
      { id: "gypsum", label: "Gypsum" },
    ],
  },
  {
    label: "Jardín y exterior",
    items: [
      { id: "jardineria", label: "Jardinería" },
      { id: "poda_arboles", label: "Poda de árboles" },
      { id: "paisajismo", label: "Paisajismo" },
      { id: "limpieza_piscinas", label: "Limpieza de piscinas" },
      { id: "riego_automatizado", label: "Riego automatizado" },
      { id: "control_plagas", label: "Control de plagas" },
    ],
  },
  {
    label: "Limpieza",
    items: [
      { id: "limpieza", label: "Limpieza del hogar" },
      { id: "limpieza_oficinas", label: "Limpieza de oficinas" },
      { id: "desinfeccion", label: "Desinfección" },
      { id: "lavado_alfombras", label: "Lavado de alfombras" },
      { id: "limpieza_post_construccion", label: "Limpieza post-construcción" },
      { id: "lavado_vehiculos", label: "Lavado de vehículos" },
    ],
  },
  {
    label: "Tecnología",
    items: [
      { id: "reparacion_computadoras", label: "Reparación de computadoras" },
      { id: "redes_internet", label: "Redes e internet" },
      { id: "camaras_seguridad", label: "Cámaras de seguridad" },
      { id: "domotica", label: "Domótica" },
      { id: "desarrollo_web", label: "Desarrollo web" },
      { id: "diseno_grafico", label: "Diseño gráfico" },
      { id: "diseno_apps", label: "Diseño de apps" },
      { id: "soporte_tecnico", label: "Soporte técnico" },
      { id: "impresion_3d", label: "Impresión 3D" },
      { id: "audio_video", label: "Audio y video" },
    ],
  },
  {
    label: "Servicios profesionales",
    items: [
      { id: "contabilidad", label: "Contabilidad y finanzas" },
      { id: "legal", label: "Abogados y legal" },
      { id: "ingenieria_civil", label: "Ingeniería civil" },
      { id: "arquitectura", label: "Arquitectura" },
      { id: "topografia", label: "Topografía" },
      { id: "consultoria", label: "Consultoría empresarial" },
      { id: "traduccion", label: "Traducción" },
      { id: "recursos_humanos", label: "Recursos humanos" },
      { id: "marketing_digital", label: "Marketing digital" },
      { id: "fotografia", label: "Fotografía profesional" },
      { id: "produccion_video", label: "Producción de video" },
      { id: "bienes_raices", label: "Bienes raíces" },
    ],
  },
  {
    label: "Salud y bienestar",
    items: [
      { id: "entrenamiento_personal", label: "Entrenamiento personal" },
      { id: "nutricion", label: "Nutrición y dietética" },
      { id: "masajes", label: "Masajes terapéuticos" },
      { id: "psicologia", label: "Psicología" },
      { id: "fisioterapia", label: "Fisioterapia" },
      { id: "enfermeria", label: "Enfermería a domicilio" },
      { id: "cuidado_adultos", label: "Cuidado de adultos mayores" },
      { id: "cuidado_infantil", label: "Cuidado infantil" },
      { id: "veterinaria", label: "Veterinaria" },
      { id: "peluqueria_canina", label: "Peluquería canina" },
    ],
  },
  {
    label: "Belleza y estética",
    items: [
      { id: "peluqueria", label: "Peluquería" },
      { id: "maquillaje", label: "Maquillaje" },
      { id: "unhas", label: "Uñas" },
      { id: "pestanas", label: "Pestañas" },
      { id: "depilacion", label: "Depilación" },
      { id: "estetica_facial", label: "Estética facial" },
      { id: "bronceado", label: "Bronceado" },
    ],
  },
  {
    label: "Educación",
    items: [
      { id: "tutorias", label: "Tutorías académicas" },
      { id: "idiomas", label: "Idiomas" },
      { id: "musica", label: "Música e instrumentos" },
      { id: "matematicas", label: "Matemáticas y ciencias" },
      { id: "preparacion_universitaria", label: "Preparación universitaria" },
      { id: "clases_manejo", label: "Clases de manejo" },
      { id: "clases_cocina", label: "Clases de cocina" },
    ],
  },
  {
    label: "Mudanzas y transporte",
    items: [
      { id: "mudanzas", label: "Mudanzas" },
      { id: "fletes", label: "Fletes" },
      { id: "mensajeria", label: "Mensajería" },
      { id: "transporte_mascotas", label: "Transporte de mascotas" },
    ],
  },
  {
    label: "Eventos",
    items: [
      { id: "fotografia_eventos", label: "Fotografía de eventos" },
      { id: "videografia", label: "Videografía" },
      { id: "dj_sonido", label: "DJ y sonido" },
      { id: "catering", label: "Catering" },
      { id: "decoracion", label: "Decoración" },
      { id: "animacion_infantil", label: "Animación infantil" },
      { id: "bartending", label: "Bartending" },
    ],
  },
  {
    label: "Seguridad",
    items: [
      { id: "guardas_seguridad", label: "Guardas de seguridad" },
      { id: "alarmas", label: "Instalación de alarmas" },
      { id: "cctv", label: "Circuito cerrado CCTV" },
      { id: "control_acceso", label: "Control de acceso" },
    ],
  },
  {
    label: "Automotriz",
    items: [
      { id: "mecanica", label: "Mecánica general" },
      { id: "hojalateria", label: "Hojalatería y pintura" },
      { id: "electricidad_automotriz", label: "Electricidad automotriz" },
      { id: "tapiceria", label: "Tapicería" },
      { id: "detailing", label: "Detailing" },
      { id: "cambio_llantas", label: "Cambio de llantas a domicilio" },
    ],
  },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

function validateCedulaFormat(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return /^[1-9]\d{8}$/.test(d) || /^\d{11,12}$/.test(d) || /^\d{10}$/.test(d);
}

const step1Schema = z
  .object({
    firstName: z.string().min(2, "Nombre requerido"),
    firstLastName: z.string().min(2, "Primer apellido requerido"),
    secondLastName: z.string().optional(),
    cedula: z
      .string()
      .min(9, "Cédula inválida")
      .refine(validateCedulaFormat, "Formato inválido. CR: 9 dígitos. DIMEX: 11-12. NITE: 10."),
    email: z.string().email("Email inválido"),
    password: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/[A-Z]/, "Al menos una mayúscula")
      .regex(/[a-z]/, "Al menos una minúscula")
      .regex(/[0-9]/, "Al menos un número")
      .regex(/[!@#$%^&*]/, "Al menos un carácter especial (!@#$%^&*)"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

const step2Schema = z.object({
  category: z.string().min(1, "Seleccioná una categoría"),
  province: z.string().min(1, "Seleccioná una provincia"),
  canton: z.string().min(1, "Seleccioná un cantón"),
  whatsapp: z.string().min(8, "Número inválido").max(12),
  address: z.string().optional(),
});

const step3Schema = z.object({
  bio: z.string().min(30, "Mínimo 30 caracteres").max(500),
  yearsExperience: z.string().optional(),
  hourlyRate: z.string().optional(),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;

// ─── Helper components ────────────────────────────────────────────────────────

function PasswordChecklist({ password }: { password: string }) {
  const rules = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Una letra mayúscula", ok: /[A-Z]/.test(password) },
    { label: "Una letra minúscula", ok: /[a-z]/.test(password) },
    { label: "Un número", ok: /[0-9]/.test(password) },
    { label: "Un carácter especial (!@#$%^&*)", ok: /[!@#$%^&*]/.test(password) },
  ];
  if (!password) return null;
  return (
    <div className="flex flex-col gap-1 mt-1">
      {rules.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          )}
          <span className={`text-xs ${r.ok ? "text-emerald-600" : "text-gray-400"}`}>
            {r.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
              i < current
                ? "bg-[#009FD9] text-white"
                : i === current
                ? "bg-[#009FD9] text-white ring-4 ring-[#009FD9]/20"
                : "bg-[#e5e7eb] text-[#9ca3af]"
            )}
          >
            {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-sm font-medium hidden sm:block",
              i === current ? "text-[#009FD9]" : "text-[#9ca3af]"
            )}
          >
            {label}
          </span>
          {i < labels.length - 1 && (
            <div
              className={cn("h-px w-8 sm:w-12 transition-all", i < current ? "bg-[#009FD9]" : "bg-[#e5e7eb]")}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Photo picker ─────────────────────────────────────────────────────────────

function PhotoPicker({
  preview,
  onFile,
}: {
  preview: string | null;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-2 mb-4">
      <div
        onClick={() => ref.current?.click()}
        className="relative h-24 w-24 rounded-full cursor-pointer group"
      >
        {preview ? (
          <img
            src={preview}
            alt="Foto de perfil"
            className="h-24 w-24 rounded-full object-cover border-2 border-[#e5e7eb]"
          />
        ) : (
          <div className="h-24 w-24 rounded-full bg-[#EBF5FB] border-2 border-dashed border-[#bfdbfe] flex items-center justify-center">
            <Camera className="h-8 w-8 text-[#009FD9]" />
          </div>
        )}
        <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera className="h-5 w-5 text-white" />
        </div>
      </div>
      <p className="text-xs text-[#9ca3af]">
        {preview ? "Cambiá tu foto" : "Foto de perfil (opcional)"}
      </p>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RegisterProfessionalPage() {
  const t = useTranslations("registration.pro");
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();

  // step: -1=loading, 0=identity (email/pw users), 1=service+location, 2=profile+photo
  const [step, setStep] = useState(-1);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [serviceMobile, setServiceMobile] = useState(false);
  const [serviceFixed, setServiceFixed] = useState(false);
  const [serviceTypeError, setServiceTypeError] = useState<string | null>(null);
  const [whatsappValue, setWhatsappValue] = useState("");
  const [whatsappFormatted, setWhatsappFormatted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);

  const cantons = getCantonsByProvince(selectedProvince);

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  const watchedPassword = form1.watch("password") ?? "";

  useEffect(() => {
    if (!authLoading) {
      setStep(currentUser ? 1 : 0);
    }
  }, [authLoading, currentUser]);

  function handlePhotoSelect(file: File) {
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  function handleWhatsappChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setWhatsappValue(digits);
    if (digits.length === 8 && /^[678]/.test(digits)) {
      setWhatsappFormatted(`+506 ${digits.slice(0, 4)}-${digits.slice(4)}`);
    } else {
      setWhatsappFormatted(digits);
    }
    form2.setValue("whatsapp", digits);
  }

  // ── Cédula API lookup — commented out, activate when credentials arrive ──
  // async function lookupCedula(cedula: string) {
  //   if (!validateCedulaFormat(cedula)) return;
  //   const res = await fetch(`/api/cedula/${cedula.replace(/\D/g, "")}`);
  //   if (res.ok) {
  //     const { fullName } = await res.json();
  //     form1.setValue("firstName", fullName.split(" ")[0] ?? "");
  //     form1.setValue("firstLastName", fullName.split(" ")[1] ?? "");
  //     form1.setValue("secondLastName", fullName.split(" ").slice(2).join(" ") ?? "");
  //   }
  // }

  function onStep1(data: Step1Data) {
    setStep1Data(data);
    setStep(1);
  }

  function onStep2(data: Step2Data) {
    if (!serviceMobile && !serviceFixed) {
      setServiceTypeError("Seleccioná al menos un tipo de servicio");
      return;
    }
    setServiceTypeError(null);
    setStep2Data(data);
    setStep(2);
  }

  async function onStep3(data: Step3Data) {
    if (!step2Data) return;
    setSubmitting(true);
    setError(null);

    try {
      // ── 1. Upload photo if provided ────────────────────────────────────────
      let photoUrl: string | undefined;
      if (photoFile) {
        setUploadingPhoto(true);
        const fd = new FormData();
        fd.append("file", photoFile);
        const uploadRes = await fetch("/api/upload/photo", { method: "POST", body: fd });
        setUploadingPhoto(false);
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          photoUrl = url;
        }
      }

      const supabase = createClient();
      let userId: string;
      let userEmail: string;

      if (currentUser) {
        // ── 2a. OAuth / already-logged-in path ────────────────────────────────
        userId = currentUser.id;
        userEmail = currentUser.email ?? "";
      } else {
        // ── 2b. Email/password path ───────────────────────────────────────────
        if (!step1Data) return;
        const fullName = [step1Data.firstName, step1Data.firstLastName, step1Data.secondLastName]
          .filter(Boolean)
          .join(" ")
          .trim();

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: step1Data.email,
          password: step1Data.password,
          options: {
            data: {
              full_name: fullName,
              cedula: step1Data.cedula.replace(/\D/g, ""),
              role: "professional",
              onboarding_completed: true,
            },
          },
        });
        if (signUpError) throw signUpError;
        if (!signUpData.user?.id) throw new Error("No se pudo crear la cuenta.");
        userId = signUpData.user.id;
        userEmail = step1Data.email;
      }

      // ── 3. Build names for the profile upsert ─────────────────────────────
      const fullName = currentUser
        ? (currentUser.user_metadata?.full_name as string) ||
          (currentUser.user_metadata?.name as string) ||
          (currentUser.email?.split("@")[0] ?? "profesional")
        : [step1Data!.firstName, step1Data!.firstLastName, step1Data!.secondLastName]
            .filter(Boolean)
            .join(" ")
            .trim();

      const serviceType = [
        serviceMobile ? "mobile" : null,
        serviceFixed ? "fixed" : null,
      ]
        .filter(Boolean)
        .join(",");

      // ── 4. Create/upsert profile + professional record ─────────────────────
      const proRes = await fetch("/api/register/professional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: userEmail,
          fullName,
          cedula: step1Data?.cedula?.replace(/\D/g, "") ?? null,
          photoUrl,
          category: step2Data.category,
          serviceType,
          province: step2Data.province,
          canton: step2Data.canton,
          address: step2Data.address || null,
          whatsapp: step2Data.whatsapp,
          bio: data.bio,
          yearsExperience: data.yearsExperience,
          hourlyRate: data.hourlyRate,
        }),
      });

      if (!proRes.ok) {
        const { error: proErr } = await proRes.json();
        throw new Error(proErr ?? "Error al crear tu perfil de profesional.");
      }

      if (currentUser) {
        router.push("/dashboard/profesional");
      } else {
        setOtpEmail(step1Data!.email);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrarse";
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        setError("Este email ya está registrado. ¿Querés iniciar sesión?");
      } else if (msg.includes("cédula")) {
        setError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
      setUploadingPhoto(false);
    }
  }

  // ── OTP screen ──────────────────────────────────────────────────────────────
  if (otpEmail) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-sm">
            <OtpVerification email={otpEmail} />
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  // ── Auth loading ─────────────────────────────────────────────────────────────
  if (step === -1) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  const stepLabels = currentUser
    ? ["Servicio", "Perfil"]
    : ["Identidad", "Servicio", "Perfil"];
  const indicatorStep = currentUser ? step - 1 : step;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-10 px-4">
        <div className="mx-auto max-w-lg">
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold text-[#111827]">
              {currentUser ? "Completá tu perfil profesional" : t("title")}
            </h1>
            <p className="text-[#6b7280] text-sm mt-1">
              {currentUser
                ? "Contanos sobre tu servicio para que los clientes te encuentren."
                : t("subtitle")}
            </p>
          </div>
          <StepIndicator current={indicatorStep} labels={stepLabels} />

          {error && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ── Step 0: Identity (email/password users only) ─────────────── */}
          {step === 0 && !currentUser && (
            <form onSubmit={form1.handleSubmit(onStep1)} className="flex flex-col gap-4">
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Nombre *"
                  placeholder="Juan"
                  error={form1.formState.errors.firstName?.message}
                  {...form1.register("firstName")}
                />
                <Input
                  label="Primer apellido *"
                  placeholder="Pérez"
                  error={form1.formState.errors.firstLastName?.message}
                  {...form1.register("firstLastName")}
                />
              </div>
              <Input
                label="Segundo apellido"
                placeholder="González"
                hint="Opcional"
                {...form1.register("secondLastName")}
              />

              {/* Cédula — manual input, no API lookup */}
              <div>
                <Input
                  label="Número de cédula *"
                  placeholder="1-0000-0000"
                  hint="CR: 9 dígitos · DIMEX: 11-12 · NITE: 10"
                  error={form1.formState.errors.cedula?.message}
                  {...form1.register("cedula")}
                  // onBlur={(e) => lookupCedula(e.target.value)}  // ← activate when API credentials arrive
                />
              </div>

              <div className="border-t border-[#f3f4f6] pt-4">
                <Input
                  label={t("email")}
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  error={form1.formState.errors.email?.message}
                  {...form1.register("email")}
                />
              </div>

              <div>
                <Input
                  label={t("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordPlaceholder")}
                  error={form1.formState.errors.password?.message}
                  {...form1.register("password")}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />
                <PasswordChecklist password={watchedPassword} />
              </div>

              <Input
                label="Confirmar contraseña"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                error={form1.formState.errors.confirmPassword?.message}
                {...form1.register("confirmPassword")}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <Button type="submit" size="lg" className="mt-2">
                {t("continue")} <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-center text-xs text-[#9ca3af]">
                {t("terms")}{" "}
                <Link href="/terminos" className="text-[#009FD9] hover:underline">
                  {t("termsLink")}
                </Link>
              </p>
            </form>
          )}

          {/* ── Step 1: Service + Location ───────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={form2.handleSubmit(onStep2)} className="flex flex-col gap-4">

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("category")}
                </label>
                <Select onValueChange={(v) => form2.setValue("category", v)}>
                  <SelectTrigger className={form2.formState.errors.category ? "border-red-400" : ""}>
                    <SelectValue placeholder={t("categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {form2.formState.errors.category && (
                  <p className="text-xs text-red-500 mt-1">
                    {form2.formState.errors.category.message}
                  </p>
                )}
              </div>

              {/* Service type */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-2">
                  ¿Cómo ofrecés tus servicios?
                </label>
                <div className="flex flex-col gap-2">
                  <label className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                    serviceMobile ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#009FD9]/40"
                  )}>
                    <input
                      type="checkbox"
                      checked={serviceMobile}
                      onChange={(e) => {
                        setServiceMobile(e.target.checked);
                        setServiceTypeError(null);
                      }}
                      className="sr-only"
                    />
                    <div className={cn(
                      "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                      serviceMobile ? "bg-[#009FD9] border-[#009FD9]" : "border-[#d1d5db]"
                    )}>
                      {serviceMobile && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <Truck className="h-4 w-4 text-[#009FD9] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#111827]">Me desplazo donde el cliente</p>
                      <p className="text-xs text-[#9ca3af]">Vas al domicilio o lugar del cliente</p>
                    </div>
                  </label>

                  <label className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                    serviceFixed ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#009FD9]/40"
                  )}>
                    <input
                      type="checkbox"
                      checked={serviceFixed}
                      onChange={(e) => {
                        setServiceFixed(e.target.checked);
                        setServiceTypeError(null);
                      }}
                      className="sr-only"
                    />
                    <div className={cn(
                      "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                      serviceFixed ? "bg-[#009FD9] border-[#009FD9]" : "border-[#d1d5db]"
                    )}>
                      {serviceFixed && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#111827]">Trabajo desde un lugar fijo</p>
                      <p className="text-xs text-[#9ca3af]">Taller, consultorio, local o estudio</p>
                    </div>
                  </label>
                </div>
                {serviceTypeError && (
                  <p className="text-xs text-red-500 mt-1">{serviceTypeError}</p>
                )}
              </div>

              {/* Fixed location address */}
              {serviceFixed && (
                <div className="pl-1">
                  <Input
                    label="Dirección de tu lugar de trabajo"
                    placeholder="Ej: Barrio Escalante, San José"
                    hint="Dirección aproximada visible en tu perfil"
                    {...form2.register("address")}
                  />
                </div>
              )}

              {/* Province */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("province")}
                </label>
                <Select
                  onValueChange={(v) => {
                    setSelectedProvince(v);
                    form2.setValue("province", v);
                    form2.setValue("canton", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("provincePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form2.formState.errors.province && (
                  <p className="text-xs text-red-500 mt-1">
                    {form2.formState.errors.province.message}
                  </p>
                )}
              </div>

              {/* Canton */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("canton")}
                </label>
                <Select
                  disabled={!selectedProvince}
                  onValueChange={(v) => form2.setValue("canton", v)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={selectedProvince ? t("cantonPlaceholder") : t("cantonDisabled")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {cantons.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form2.formState.errors.canton && (
                  <p className="text-xs text-red-500 mt-1">
                    {form2.formState.errors.canton.message}
                  </p>
                )}
              </div>

              {/* WhatsApp */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("whatsapp")}
                </label>
                <div className="flex items-center gap-0">
                  <span className="inline-flex items-center h-10 px-3 rounded-l-xl border border-r-0 border-[#e5e7eb] bg-[#f3f4f6] text-sm font-medium text-[#374151] shrink-0">
                    +506
                  </span>
                  <input
                    type="tel"
                    placeholder="8888-8888"
                    value={whatsappValue}
                    onChange={(e) => handleWhatsappChange(e.target.value)}
                    maxLength={8}
                    className="flex-1 h-10 px-3 rounded-r-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                  />
                </div>
                {whatsappValue.length === 8 && /^[678]/.test(whatsappValue) && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Se mostrará como: {whatsappFormatted}
                  </p>
                )}
                {form2.formState.errors.whatsapp && (
                  <p className="text-xs text-red-500 mt-1">
                    {form2.formState.errors.whatsapp.message}
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-2">
                {!currentUser && (
                  <Button variant="outline" size="lg" type="button" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" /> {t("back")}
                  </Button>
                )}
                <Button type="submit" size="lg" className="flex-1">
                  {t("continue")} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}

          {/* ── Step 2: Profile + Photo ──────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={form3.handleSubmit(onStep3)} className="flex flex-col gap-4">
              {/* Photo upload */}
              <PhotoPicker preview={photoPreview} onFile={handlePhotoSelect} />

              {/* Bio */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("bio")}{" "}
                  <span className="text-[#9ca3af] font-normal ml-1">({t("bioMin")})</span>
                </label>
                <textarea
                  className={cn(
                    "w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none",
                    "border-[#e5e7eb] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all",
                    form3.formState.errors.bio && "border-red-400"
                  )}
                  placeholder={t("bioPlaceholder")}
                  {...form3.register("bio")}
                />
                {form3.formState.errors.bio && (
                  <p className="text-xs text-red-500 mt-1">
                    {form3.formState.errors.bio.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t("yearsExp")}
                  type="number"
                  placeholder={t("yearsExpPlaceholder")}
                  {...form3.register("yearsExperience")}
                />
                <Input
                  label={t("hourlyRate")}
                  type="number"
                  placeholder={t("hourlyRatePlaceholder")}
                  hint={t("optional")}
                  {...form3.register("hourlyRate")}
                />
              </div>

              <div className="flex gap-3 mt-2">
                <Button variant="outline" size="lg" type="button" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> {t("back")}
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  loading={submitting || uploadingPhoto}
                >
                  {uploadingPhoto
                    ? "Subiendo foto…"
                    : submitting
                    ? t("creating")
                    : t("create")}
                </Button>
              </div>
            </form>
          )}

          {!currentUser && (
            <p className="text-center text-sm text-[#6b7280] mt-6">
              {t("alreadyHaveAccount")}{" "}
              <Link href="/login" className="text-[#009FD9] font-medium hover:underline">
                {t("signIn")}
              </Link>
            </p>
          )}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
