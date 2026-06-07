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
import { PhoneInput } from "@/components/ui/phone-input";
import { LandingFooter } from "@/components/landing/landing-footer";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PROVINCES, getCantonsByProvince, matchProvinceCanton } from "@/lib/data/cr-geography";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { OtpVerification } from "@/components/auth/otp-verification";
import { useAuth } from "@/hooks/use-auth";
import { CategorySearch } from "@/components/ui/category-search";
import { getCategoryLabel } from "@/lib/data/categories";
import { LocationPicker, type PickedLocation } from "@/components/maps/location-picker";
import { useAvailabilityCheck } from "@/hooks/use-availability-check";

// ─── Category data now lives in src/lib/data/categories.ts ───────────────────
// CategorySearch component handles display + fuzzy search.

const CATEGORY_GROUPS_STUB = [
  {
    label: "REMOVED",
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = CATEGORY_GROUPS_STUB;

// ─── Schemas ──────────────────────────────────────────────────────────────────

function validateCedulaFormat(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return /^[1-9]\d{8}$/.test(d) || /^\d{11,12}$/.test(d) || /^\d{10}$/.test(d);
}

const step1Schema = z
  .object({
    firstName: z.string().min(2, "El nombre es requerido"),
    firstLastName: z.string().min(2, "El primer apellido es requerido"),
    secondLastName: z.string().optional(),
    cedula: z
      .string()
      .min(1, "El número de cédula es requerido")
      .refine(validateCedulaFormat, "Formato inválido. CR: 9 dígitos. DIMEX: 11-12. NITE: 10."),
    email: z.string().min(1, "El correo es requerido").email("Ingresá un correo válido"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
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
  // Province and canton are optional, independently. Canton enables after province.
  province: z.string().optional(),
  canton: z.string().optional(),
  whatsapp: z.string().min(8, "El número de WhatsApp es requerido").max(15, "Número inválido"),
  address: z.string().optional(),
});

const step3Schema = z.object({
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
  onRemove,
}: {
  preview: string | null;
  onFile: (f: File) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-3 mb-4">
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

      {preview ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
            <Camera className="h-4 w-4" /> Cambiar foto
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-red-500 hover:text-red-600">
            <X className="h-4 w-4" /> Eliminar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
          <Camera className="h-4 w-4" /> Agregar foto
        </Button>
      )}

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  // OAuth (quick-login) professionals never pass through the email/password
  // identity step, so we collect their (required) cédula in the service step.
  const [oauthCedula, setOauthCedula] = useState("");
  const [oauthCedulaError, setOauthCedulaError] = useState<string | null>(null);
  const [oauthFullName, setOauthFullName] = useState("");
  const [oauthNameError, setOauthNameError] = useState<string | null>(null);
  // Additional categories (multi-category support). Primary = step2 `category`.
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [extraCatInput, setExtraCatInput] = useState("");
  // Flexible identity (all optional beyond the personal name):
  //  - businessName: a brand or business they operate under
  //  - affiliations: institutions / workplaces they're affiliated with (multiple)
  const [businessName, setBusinessName] = useState("");
  const [affiliations, setAffiliations] = useState<string[]>([]);
  const [affiliationInput, setAffiliationInput] = useState("");

  const cantons = getCantonsByProvince(selectedProvince);

  const form1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    mode: "onBlur",
    defaultValues: { firstName: "", firstLastName: "", secondLastName: "", cedula: "", email: "", password: "", confirmPassword: "" },
  });
  const form2 = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    mode: "onBlur",
    defaultValues: { category: "", province: "", canton: "", whatsapp: "", address: "" },
  });
  const form3 = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    mode: "onBlur",
    defaultValues: { yearsExperience: "", hourlyRate: "" },
  });

  // On a failed submit, jump to the first field with an error.
  function scrollToFirstError() {
    setTimeout(() => {
      const el = document.querySelector('[aria-invalid="true"]') as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus?.();
      }
    }, 50);
  }

  const watchedPassword = form1.watch("password") ?? "";
  const watchedEmail = form1.watch("email") ?? "";
  const watchedCedula = form1.watch("cedula") ?? "";

  // Real-time duplicate detection (email/password identity step)
  const emailCheck = useAvailabilityCheck(watchedEmail, "email", !currentUser);
  const cedulaCheck = useAvailabilityCheck(watchedCedula, "cedula", !currentUser);
  // Real-time cédula check for OAuth professionals
  const oauthCedulaCheck = useAvailabilityCheck(oauthCedula, "cedula", !!currentUser);

  useEffect(() => {
    if (!authLoading) {
      setStep(currentUser ? 1 : 0);
      // Pre-fill photo preview + legal name from OAuth provider if available
      if (currentUser) {
        if (!photoPreview) {
          const oauthPhoto =
            (currentUser.user_metadata?.avatar_url as string) ||
            (currentUser.user_metadata?.picture as string) ||
            null;
          if (oauthPhoto) setPhotoPreview(oauthPhoto);
        }
        setOauthFullName((prev) =>
          prev ||
          (currentUser.user_metadata?.full_name as string) ||
          (currentUser.user_metadata?.name as string) ||
          ""
        );
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser]);

  function handlePhotoSelect(file: File) {
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
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
    if (emailCheck.taken) {
      form1.setError("email", { message: "Este correo ya está registrado. Iniciá sesión." });
      return;
    }
    if (cedulaCheck.taken) {
      form1.setError("cedula", { message: "Esta cédula ya está registrada en ContrataCR." });
      return;
    }
    setStep1Data(data);
    setStep(1);
  }

  function onStep2(data: Step2Data) {
    if (!serviceMobile && !serviceFixed) {
      setServiceTypeError("Seleccioná al menos un tipo de servicio");
      return;
    }
    // OAuth professionals must provide a cédula (clients don't — they're asked at booking).
    if (currentUser && !validateCedulaFormat(oauthCedula)) {
      setOauthCedulaError("Cédula requerida. CR: 9 dígitos · DIMEX: 11-12 · NITE: 10.");
      return;
    }
    if (currentUser && oauthCedulaCheck.taken) {
      setOauthCedulaError("Esta cédula ya está registrada en ContrataCR.");
      return;
    }
    if (currentUser && oauthFullName.trim().length < 3) {
      setOauthNameError("Ingresá tu nombre legal completo.");
      return;
    }
    setOauthNameError(null);
    setOauthCedulaError(null);
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
        ? (oauthFullName.trim() ||
          (currentUser.user_metadata?.full_name as string) ||
          (currentUser.user_metadata?.name as string) ||
          (currentUser.email?.split("@")[0] ?? "profesional"))
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
          businessName: businessName.trim() || null,
          affiliations: affiliations.filter(Boolean),
          cedula: step1Data?.cedula?.replace(/\D/g, "") ?? (oauthCedula ? oauthCedula.replace(/\D/g, "") : null),
          photoUrl,
          category: step2Data.category,
          professions: [step2Data.category, ...extraCategories],
          serviceType,
          province: step2Data.province,
          canton: step2Data.canton,
          address: pickedLocation?.formattedAddress || step2Data.address || null,
          lat: pickedLocation?.lat ?? null,
          lng: pickedLocation?.lng ?? null,
          whatsapp: step2Data.whatsapp,
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
      if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("already exists")) {
        setError("Ya existe una cuenta con este correo. ¿Querés iniciar sesión en su lugar?");
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
            <div className="flex flex-col gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
              {(error.includes("sesión") || error.includes("cuenta con este correo")) && (
                <Link
                  href="/login"
                  className="self-start ml-7 text-sm font-semibold text-[#009FD9] hover:underline"
                >
                  Ir a iniciar sesión →
                </Link>
              )}
            </div>
          )}

          {/* ── OAuth identity confirmation ───────────────────────────────── */}
          {currentUser && (
            <div className="flex items-center gap-3 bg-[#EBF5FB] border border-[#bfdbfe] rounded-xl px-4 py-3 mb-4">
              {photoPreview && (
                <img src={photoPreview} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#009FD9] font-semibold">Identidad confirmada por Google / Facebook</p>
                <p className="text-sm font-bold text-[#111827] truncate">
                  {(currentUser.user_metadata?.full_name as string) ||
                   (currentUser.user_metadata?.name as string) ||
                   currentUser.email}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-[#009FD9] shrink-0" />
            </div>
          )}

          {/* ── Step 0: Identity (email/password users only) ─────────────── */}
          {step === 0 && !currentUser && (
            <div className="flex flex-col gap-4">
              {/* OAuth fast-track — redirect back to this page after auth */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    // next param brings them back here after OAuth to complete pro registration
                    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/es/registro/profesional")}`;
                    const { error: oauthErr } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl } });
                    if (oauthErr) setError(oauthErr.message);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#e5e7eb] hover:bg-gray-50 transition-all text-sm font-medium text-[#374151] active:scale-[0.98]"
                >
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Registrarse con Google
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/es/registro/profesional")}`;
                    const { error: oauthErr } = await supabase.auth.signInWithOAuth({ provider: "facebook", options: { redirectTo: callbackUrl } });
                    if (oauthErr) setError(oauthErr.message);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#e5e7eb] hover:bg-gray-50 transition-all text-sm font-medium text-[#374151] active:scale-[0.98]"
                >
                  <svg className="h-5 w-5 shrink-0 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Registrarse con Facebook
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#f3f4f6]" /><span className="text-xs text-[#9ca3af] font-medium">o con correo y contraseña</span><div className="flex-1 h-px bg-[#f3f4f6]" />
              </div>

            <form onSubmit={form1.handleSubmit(onStep1, scrollToFirstError)} className="flex flex-col gap-4">
              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={<>Nombre <span className="text-red-500">*</span></>}
                  placeholder="Juan"
                  error={form1.formState.errors.firstName?.message}
                  {...form1.register("firstName")}
                />
                <Input
                  label={<>Primer apellido <span className="text-red-500">*</span></>}
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
                  label={<>Número de cédula <span className="text-red-500">*</span></>}
                  placeholder="1-0000-0000"
                  hint="CR: 9 dígitos · DIMEX: 11-12 · NITE: 10"
                  error={form1.formState.errors.cedula?.message ?? (cedulaCheck.taken ? "Esta cédula ya está registrada en ContrataCR." : undefined)}
                  {...form1.register("cedula")}
                  // onBlur={(e) => lookupCedula(e.target.value)}  // ← activate when API credentials arrive
                />
              </div>

              <div className="border-t border-[#f3f4f6] pt-4">
                <Input
                  label={<>{t("email")} <span className="text-red-500">*</span></>}
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  error={form1.formState.errors.email?.message ?? (emailCheck.taken ? "Este correo ya está registrado. Iniciá sesión." : undefined)}
                  {...form1.register("email")}
                />
              </div>

              <div>
                <Input
                  label={<>{t("password")} <span className="text-red-500">*</span></>}
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
            </div>
          )}

          {/* ── Step 1: Service + Location ───────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={form2.handleSubmit(onStep2, scrollToFirstError)} className="flex flex-col gap-4">

              {/* Name + cédula — required for OAuth professionals (no identity step) */}
              {currentUser && (
                <Input
                  label={<>Nombre legal completo <span className="text-red-500">*</span></>}
                  placeholder="Juan Pérez González"
                  value={oauthFullName}
                  onChange={(e) => { setOauthFullName(e.target.value); setOauthNameError(null); }}
                  error={oauthNameError ?? undefined}
                />
              )}
              {currentUser && (
                <Input
                  label={<>Número de cédula <span className="text-red-500">*</span></>}
                  placeholder="1-0000-0000"
                  hint="Requerido para profesionales · CR: 9 dígitos · DIMEX: 11-12 · NITE: 10"
                  value={oauthCedula}
                  onChange={(e) => { setOauthCedula(e.target.value); setOauthCedulaError(null); }}
                  error={oauthCedulaError ?? (oauthCedulaCheck.taken ? "Esta cédula ya está registrada en ContrataCR." : undefined)}
                />
              )}

              {/* Identidad (todo opcional — se puede completar luego en el perfil) */}
              <div className="rounded-xl border border-[#e5e7eb] p-4 flex flex-col gap-3">
                <p className="text-xs text-[#6b7280]">
                  Tu nombre personal ya quedó registrado. Lo siguiente es <strong>opcional</strong> y
                  podés completarlo después desde tu perfil.
                </p>
                <Input
                  label={<>Nombre comercial o marca <span className="text-[#9ca3af] font-normal">(opcional)</span></>}
                  placeholder="Ej: Servicios Eléctricos GAM"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    Instituciones o lugares donde trabajás <span className="text-[#9ca3af] font-normal">(opcional)</span>
                  </label>
                  {affiliations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {affiliations.map((a) => (
                        <span key={a} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                          {a}
                          <button type="button" onClick={() => setAffiliations((prev) => prev.filter((x) => x !== a))} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={affiliationInput}
                      onChange={(e) => setAffiliationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = affiliationInput.trim();
                          if (v && !affiliations.includes(v)) setAffiliations((prev) => [...prev, v]);
                          setAffiliationInput("");
                        }
                      }}
                      placeholder="Ej: Hospital CIMA, Clínica Bíblica…"
                      className="flex-1 h-10 px-3 rounded-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={() => {
                        const v = affiliationInput.trim();
                        if (v && !affiliations.includes(v)) setAffiliations((prev) => [...prev, v]);
                        setAffiliationInput("");
                      }}
                    >
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>

              {/* Category — searchable combobox */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("category")} <span className="text-red-500">*</span>
                </label>
                <CategorySearch
                  value={form2.watch("category") ?? ""}
                  onChange={(v) => form2.setValue("category", v, { shouldValidate: true })}
                  placeholder="Buscá tu especialidad"
                  error={form2.formState.errors.category?.message}
                />

                {/* Additional categories (optional, multi-category) */}
                <div className="mt-2">
                  {extraCategories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {extraCategories.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                          {getCategoryLabel(c)}
                          <button type="button" onClick={() => setExtraCategories((prev) => prev.filter((x) => x !== c))} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label="Quitar">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <CategorySearch
                    value={extraCatInput}
                    onChange={(v) => {
                      const primary = form2.watch("category");
                      if (v && v !== primary && !extraCategories.includes(v)) {
                        setExtraCategories((prev) => [...prev, v]);
                      }
                      setExtraCatInput("");
                    }}
                    placeholder="Agregá otra categoría (opcional)"
                  />
                </div>
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

              {/* Fixed location — map picker */}
              {serviceFixed && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#374151]">
                    Ubicación de tu local / estudio / oficina
                  </label>
                  <p className="text-xs text-[#9ca3af]">
                    Marcá tu dirección exacta. Los clientes la verán en el mapa.
                  </p>
                  <LocationPicker
                    value={pickedLocation}
                    onChange={(loc) => {
                      setPickedLocation(loc);
                      // Auto-fill province/canton from the dropped pin (still editable).
                      if (loc) {
                        const { provinceId, cantonId } = matchProvinceCanton(loc.provinceName, loc.cantonName);
                        if (provinceId) {
                          setSelectedProvince(provinceId);
                          form2.setValue("province", provinceId);
                          form2.setValue("canton", cantonId ?? "");
                        }
                      }
                    }}
                  />
                  <p className="text-xs text-[#9ca3af]">
                    Si marcás tu ubicación, completamos provincia y cantón automáticamente. Podés ajustarlos.
                  </p>
                </div>
              )}

              {/* Province */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("province")} <span className="text-[#9ca3af] font-normal">(opcional)</span>
                </label>
                <Select
                  value={form2.watch("province") || undefined}
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
                  {t("canton")} <span className="text-[#9ca3af] font-normal">(opcional)</span>
                </label>
                <Select
                  value={form2.watch("canton") || undefined}
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
              <PhoneInput
                label={t("whatsapp")}
                required
                value={whatsappValue}
                onChange={(digits) => { setWhatsappValue(digits); form2.setValue("whatsapp", digits, { shouldValidate: true }); }}
                error={form2.formState.errors.whatsapp?.message}
              />

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
            <form onSubmit={form3.handleSubmit(onStep3, scrollToFirstError)} className="flex flex-col gap-4">
              {/* Photo upload */}
              <PhotoPicker preview={photoPreview} onFile={handlePhotoSelect} onRemove={() => { setPhotoFile(null); setPhotoPreview(null); }} />

              <p className="text-sm text-[#6b7280] text-center">
                Después agregás tus servicios con su precio y años de experiencia desde tu panel.
              </p>

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
