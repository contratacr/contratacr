// «Ofrezco servicios» → «¿Cómo ofrece sus servicios?» on /registro and /onboarding is its own history entry
// (?paso=profesional). Next's router syncs useSearchParams with history.pushState/replaceState, so the page re-renders
// with the step without a navigation.

function conPaso(abierto: boolean): string {
  const url = new URL(window.location.href);
  if (abierto) url.searchParams.set("paso", "profesional"); else url.searchParams.delete("paso");
  return url.pathname + url.search + url.hash;
}

export function abrirPasoProfesional() {
  window.history.pushState(null, "", conPaso(true));
}

/** Back to the first question: through the history when this page opened the step, else (arrived with ?paso) in place. */
export function cerrarPasoProfesional(abiertoAqui: boolean) {
  if (abiertoAqui) window.history.back();
  else window.history.replaceState(null, "", conPaso(false));
}
