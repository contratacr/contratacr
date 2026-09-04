// Pide confirmación antes de cerrar/salir con cambios sin guardar.
//
// Si hay un <UnsavedChangesGuard dirty> montado, él atiende el evento y abre su
// diálogo con la acción en espera. Si nadie lo atiende (sin cambios, o sin
// guardián), la acción corre de una — el mismo contrato que ya usa el panel.
export function confirmarSalidaSinGuardar(accion: () => void) {
  if (typeof window === "undefined") { accion(); return; }
  const detalle: { proceed: () => void; handled?: boolean } = { proceed: accion };
  window.dispatchEvent(new CustomEvent("ccr:confirm-unsaved-action", { detail: detalle }));
  if (!detalle.handled) accion();
}
