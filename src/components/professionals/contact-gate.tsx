"use client";

import { useCallback, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { type ContactIntent } from "@/components/auth/client-registration-modal";

/**
 * Contactar es UN toque. No hay ventana, no hay formulario, no hay cuenta.
 *
 * Aquí hubo dos cosas y las dos costaron clientes. Primero un registro completo
 * —cédula, correo, contraseña y código—: de nueve personas que tocaron
 * «WhatsApp», ocho se fueron. Después un formulario de dos campos, que seguía
 * cobrando fricción por un dato que el profesional recibe igual, porque
 * WhatsApp le muestra el número de quien le escribe.
 *
 * Tampoco se le avisa al profesional: decirle «casi te contactan» no le sirve
 * de nada, y si de verdad lo contactan se entera solo. Quién buscó a quién se
 * sigue registrando como siempre, en `interaction_events`, y eso es lo que mira
 * el panel de administración.
 */

type GateOptions = {
  professionalName: string;
  intent: Exclude<ContactIntent, "booking">;
  professionalId?: string;
  source?: string;
  categoryId?: string | null;
};

export function useContactGate(opciones: GateOptions) {
  // La forma se conserva para que quien llama no tenga que cambiar, aunque ya
  // no haya nada que decidir.
  void opciones;
  const { user } = useAuth();
  // Siempre `true`: nadie se queda afuera. Se conserva la forma para que quien
  // llama no tenga que cambiar.
  const requireAccount = useCallback(() => true, []);
  const modals: ReactNode = null;
  return { requireAccount, modals, signedIn: !!user };
}
