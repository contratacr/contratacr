"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useLocale } from "next-intl";
import { Star } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { destinoDeResena, type DestinoResena } from "@/lib/notifications/resena-destino";
import { cn } from "@/lib/utils";

/**
 * LA VENTANA QUE PIDE LA RESEÑA, en lugar del aviso flotante.
 *
 * Antes la invitación salía como notificación flotante a los 10 s de la
 * primera acción real (escribir por WhatsApp, publicar…): la persona todavía
 * no había vivido la experiencia. Ahora (decisión de Isaac, 13-nov-2026, texto
 * «B»; el del cliente, opción 1):
 *  - Se espera DOS DÍAS desde que nació la invitación: da tiempo a que el
 *    profesional responda y el trabajo avance.
 *  - Se muestra al ABRIR la app o el sitio, una vez por apertura, nunca en
 *    medio de un formulario, un chat o el acceso.
 *  - No se pregunta antes «¿te gusta?»: Google Play lo prohíbe antes de pedir
 *    calificación y Google no permite pedir reseñas solo a quien está contento.
 *    A todos se les ofrece lo mismo.
 *  - Desde la app va a SU tienda (App Store o Google Play); desde el navegador,
 *    a Google (resena-destino.ts).
 *  - «Ahora no» la pospone 60 días; a la tercera vez no vuelve. «Dejar mi
 *    reseña» la da por atendida. El aviso sigue en la campanita como historial.
 */

const ESPERA_MS = 2 * 86_400_000;
const POSPONER_MS = 60 * 86_400_000;
const MAX_POSPUESTAS = 3;
const DEMORA_AL_ABRIR_MS = 5_000;
const CLAVE = "ccr:resena-invitacion:v1";
const SESION = "ccr:resena-invitacion-sesion:v1";

const COPIA = {
  cliente: {
    es: { titulo: "Tu reseña ayuda a otros a encontrar ayuda", cuerpo: "Cuanta más gente conoce ContrataCR, más fácil es para todos encontrar un buen profesional cerca. Una reseña tuya ayuda a que eso pase." },
    en: { titulo: "Your review helps others find help", cuerpo: "The more people know ContrataCR, the easier it is for everyone to find a good professional nearby. A review from you helps make that happen." },
  },
  profesional: {
    es: { titulo: "Tu reseña nos ayuda a traerte más clientes", cuerpo: "Cuanta más gente conoce ContrataCR, más clientes encuentran tu perfil. Una reseña tuya ayuda a que eso pase." },
    en: { titulo: "Your review helps us bring you more clients", cuerpo: "The more people know ContrataCR, the more clients find your profile. A review from you helps make that happen." },
  },
} as const;

const NOTA = {
  app_store: { es: "Tarda menos de un minuto. Se abre en el App Store.", en: "It takes less than a minute. It opens in the App Store." },
  google_play: { es: "Tarda menos de un minuto. Se abre en Google Play.", en: "It takes less than a minute. It opens in Google Play." },
  google: { es: "Tarda menos de un minuto. Se abre en Google.", en: "It takes less than a minute. It opens in Google." },
} as const;

// Donde una ventana interrumpe algo a medias, o la sesión aún se resuelve.
function pantallaOcupada(pathname: string | null) {
  const ruta = (pathname ?? "/").replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
  return ["/login", "/registro", "/onboarding", "/completar-perfil", "/continuar-perfil", "/auth", "/reset-password",
    "/olvide-contrasena", "/notificaciones", "/mensajes", "/publicar", "/cotizar", "/verificacion", "/admin", "/resena-google", "/contacto"]
    .some((prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}/`) || ruta.startsWith(`${prefijo}-`));
}

type Estado = { veces: number; hasta: number };

function leerEstado(userId: string): Estado {
  try {
    const valor = JSON.parse(window.localStorage.getItem(`${CLAVE}:${userId}`) ?? "null");
    return { veces: Number(valor?.veces) || 0, hasta: Number(valor?.hasta) || 0 };
  } catch {
    return { veces: 0, hasta: 0 };
  }
}

function guardarEstado(userId: string, estado: Estado) {
  try { window.localStorage.setItem(`${CLAVE}:${userId}`, JSON.stringify(estado)); } catch { /* sin almacenamiento: vuelve a preguntar en la próxima apertura */ }
}

export function ResenaInvitacion() {
  const { user, hasProfessionalProfile } = useAuth();
  const pathname = usePathname();
  const locale = useLocale() === "en" ? "en" : "es";
  const [aviso, setAviso] = useState<{ id: string; destino: DestinoResena } | null>(null);

  useEffect(() => {
    if (!user || pantallaOcupada(pathname)) return;
    try {
      if (window.sessionStorage.getItem(SESION) === user.id) return;
    } catch { /* sin almacenamiento de sesión: se comprueba igual */ }
    const estado = leerEstado(user.id);
    if (estado.veces >= MAX_POSPUESTAS || estado.hasta > Date.now()) return;

    let cancelado = false;
    const temporizador = window.setTimeout(async () => {
      const { data } = await createClient().from("notifications").select("id, created_at")
        .eq("user_id", user.id).eq("type", "resena_google").eq("read", false).limit(1).maybeSingle();
      if (cancelado || !data || Date.now() - Date.parse(data.created_at) < ESPERA_MS) return;
      // Otra ventana abierta (publicar, el asistente…): no se encima; otro día.
      if (document.visibilityState !== "visible" || document.querySelector("[role=dialog]")) return;
      if (pantallaOcupada(window.location.pathname)) return;
      try { window.sessionStorage.setItem(SESION, user.id); } catch { /* ignore */ }
      // El destino se decide al mostrarla, no al cargar: a los 5 s Capacitor
      // ya se presentó, y si el sistema no se sabe, va a Google.
      let sistema: string | null = null;
      try { sistema = Capacitor.getPlatform(); } catch { /* sin Capacitor: navegador */ }
      setAviso({ id: data.id, destino: destinoDeResena(isNativeAppRuntime(), sistema) });
    }, DEMORA_AL_ABRIR_MS);
    return () => { cancelado = true; window.clearTimeout(temporizador); };
  }, [user, pathname]);

  if (!user || !aviso) return null;

  const copia = COPIA[hasProfessionalProfile ? "profesional" : "cliente"][locale];
  const en = locale === "en";
  const marcarLeida = () => {
    void createClient().from("notifications").update({ read: true }).eq("id", aviso.id).then(() => {
      window.dispatchEvent(new CustomEvent("notificationsChanged"));
    });
  };
  const posponer = () => {
    const estado = leerEstado(user.id);
    const veces = estado.veces + 1;
    guardarEstado(user.id, { veces, hasta: Date.now() + POSPONER_MS });
    if (veces >= MAX_POSPUESTAS) marcarLeida();
    setAviso(null);
  };
  const boton = "inline-flex h-11 w-full items-center justify-center rounded-full text-[15px] font-bold transition-colors";

  return (
    <Modal
      open
      onClose={posponer}
      title=""
      hideHeader
      mobilePresentation="center"
      size="sm"
      footer={
        <div className="grid w-full gap-2">
          <a
            href={aviso.destino.href}
            target="_blank"
            rel="noopener noreferrer"
            data-resena-invitacion="dejar"
            data-resena-destino={aviso.destino.destino}
            onClick={() => { marcarLeida(); setAviso(null); }}
            className={cn(boton, "bg-[#009FD9] text-white hover:bg-[#0089bb]")}
          >
            {en ? "Leave my review" : "Dejar mi reseña"}
          </a>
          <button type="button" data-resena-invitacion="ahora-no" onClick={posponer} className={cn(boton, "bg-[#f1f5f9] text-[#162543] hover:bg-[#e6edf4]")}>
            {en ? "Not now" : "Ahora no"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 pt-2 text-center" data-resena-invitacion="ventana">
        <span className="ccr-caja-icono grid h-14 w-14 place-items-center rounded-2xl">
          <Star className="h-7 w-7" />
        </span>
        <h2 className="text-xl font-black leading-7 text-[#162543]">{copia.titulo}</h2>
        <p className="text-[15px] leading-6 text-[#4b5b70]">{copia.cuerpo}</p>
        <p className="text-xs text-[#8b95a5]">{NOTA[aviso.destino.destino][locale]}</p>
      </div>
    </Modal>
  );
}
