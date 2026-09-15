"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { type ContactIntent } from "@/components/auth/client-registration-modal";

/**
 * Contactar es UN toque. No hay ventana, no hay formulario, no hay cuenta.
 *
 * Aquí hubo dos cosas y las dos costaron clientes. Primero un registro completo
 * —cédula, correo, contraseña y código—: de nueve personas que tocaron
 * «WhatsApp», ocho se fueron. Después un formulario de dos campos, que era
 * mejor pero seguía cobrando fricción por un dato que el profesional recibe
 * igual: cuando alguien le escribe por WhatsApp, WhatsApp le muestra su número.
 *
 * Lo único que queda es un aviso al profesional —«alguien te buscó por Redes e
 * internet»—, que sale solo y no le pide nada a nadie. Si quien toca tiene
 * sesión, el aviso lleva su nombre.
 */

type GateOptions = {
  professionalName: string;
  intent: Exclude<ContactIntent, "booking">;
  professionalId?: string;
  source?: string;
  categoryId?: string | null;
};

export function useContactGate({ intent, professionalId, source = "profile", categoryId = null }: GateOptions) {
  const { user } = useAuth();
  const locale = useLocale();
  const avisado = useRef(false);
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  useEffect(() => { queueMicrotask(() => setDestino(document.body)); }, []);

  // Siempre `true`: nadie se queda afuera. Recibe la acción y la ignora, para
  // que quien llama no tenga que cambiar su forma de pedir permiso.
  const requireAccount = useCallback(() => {
    if (!professionalId || avisado.current) return true;
    avisado.current = true;
    trackInteraction({ type: "contact_lead_created", professionalId, source, metadata: { channel: intent } });
    // Por detrás, sin hacer esperar a nadie: si falla, el contacto ocurre igual.
    void fetch("/api/contact/invitado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId, canal: intent, categoriaId: categoryId, locale }),
      keepalive: true,
    }).catch(() => undefined);
    return true;
  }, [professionalId, intent, source, categoryId, locale]);

  // Sin ventanas que dibujar. El portal se conserva por si vuelve a hacer falta.
  const modals: ReactNode = destino ? createPortal(null, destino) : null;

  return { requireAccount, modals, signedIn: !!user };
}
