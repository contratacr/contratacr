"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAppDialog } from "@/hooks/use-app-dialog";

/**
 * Lo que ve una cuenta SIN perfil profesional cuando toca «Publicar empleo» o
 * «Publicar promoción».
 *
 * Antes los tableros mandaban al login a todo el que no pudiera publicar,
 * tuviera sesión o no: alguien que ya había ingresado tocaba el botón y caía en
 * la pantalla de ingresar, sin una palabra de por qué. No le faltaba una
 * cuenta —ya tenía una—: le faltaba el perfil profesional.
 *
 * Se dice «cuenta profesional» porque así la llama la gente, pero el texto
 * aclara «sin crear otra»: la cuenta es una sola y lo que se agrega es el
 * perfil; sin esa aclaración la frase invita a registrarse de nuevo con otro
 * correo. El botón dice lo mismo que en el resto del app: «Ofrecer mis
 * servicios».
 *
 * Publicar un PROYECTO no pasa por aquí: eso lo hace cualquier cuenta.
 */
export function useAvisoPerfilProfesional() {
  const { dialogNode, confirm } = useAppDialog();
  const t = useTranslations("perfilProfesionalGate");
  const router = useRouter();

  const avisar = useCallback(async (que: "empleo" | "promocion", destino: string) => {
    const { confirmed } = await confirm({
      title: t(que === "empleo" ? "jobTitle" : "offerTitle"),
      description: t(que === "empleo" ? "jobDescription" : "offerDescription"),
      confirmLabel: t("cta"),
      cancelLabel: t("notNow"),
    });
    // Al terminar el registro vuelve a lo que venía a hacer.
    if (confirmed) router.push(`/registro/profesional?redirect=${encodeURIComponent(destino)}`);
  }, [confirm, router, t]);

  return { avisoNode: dialogNode, avisar };
}
