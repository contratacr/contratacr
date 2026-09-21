type BodyScrollLockState = {
  locks: Set<symbol>;
  previousOverflow: string;
  previousPosition: string;
  previousTop: string;
  previousWidth: string;
  scrollY: number;
  /** Si al soltar el candado hay que devolver la pantalla a donde estaba. */
  restaurar: boolean;
};

declare global {
  // Kept on globalThis so HMR/remounts do not lose the current lock state in dev.
  var __CONTRATACR_BODY_SCROLL_LOCK__: BodyScrollLockState | undefined;
}

function getState(): BodyScrollLockState {
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__ ??= {
    locks: new Set<symbol>(),
    previousOverflow: "",
    previousPosition: "",
    previousTop: "",
    previousWidth: "",
    scrollY: 0,
    restaurar: true,
  };
  // Older HMR instances may still carry the smaller pre-keyboard state shape.
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.previousPosition ??= "";
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.previousTop ??= "";
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.previousWidth ??= "";
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.scrollY ??= 0;
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.restaurar ??= true;
  return globalThis.__CONTRATACR_BODY_SCROLL_LOCK__;
}

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined" || !document.body) return () => {};

  const state = getState();
  const token = Symbol("body-scroll-lock");

  if (state.locks.size === 0) {
    state.previousOverflow = document.body.style.overflow;
    state.previousPosition = document.body.style.position;
    state.previousTop = document.body.style.top;
    state.previousWidth = document.body.style.width;
    state.scrollY = window.scrollY;
    state.restaurar = true;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${state.scrollY}px`;
    document.body.style.width = "100%";
  }

  state.locks.add(token);

  return () => {
    if (!state.locks.delete(token)) return;

    if (state.locks.size === 0 && document.body) {
      document.body.style.overflow = state.previousOverflow;
      document.body.style.position = state.previousPosition;
      document.body.style.top = state.previousTop;
      document.body.style.width = state.previousWidth;
      // Solo se devuelve la pantalla si nadie pidió estrenar arriba mientras el
      // candado estaba puesto. Con el cuerpo en `position: fixed` la ventana YA
      // está en 0, así que un `scrollTo(0)` de la pantalla nueva no hacía nada
      // y este `scrollTo` la bajaba de vuelta: abrir una sección desde el menú
      // la dejaba a media altura.
      if (state.restaurar) window.scrollTo({ top: state.scrollY, left: 0, behavior: "instant" });
      state.previousOverflow = "";
      state.previousPosition = "";
      state.previousTop = "";
      state.previousWidth = "";
      state.scrollY = 0;
      state.restaurar = true;
    }
  };
}

/**
 * «No devuelvas la pantalla a donde estaba al soltar el candado».
 *
 * La llama `irAlInicio()`: si se abre una sección con un menú o una ventana
 * encima, el candado guarda la altura anterior y la restaura al cerrarse,
 * después de que la sección nueva ya se puso arriba.
 */
export function olvidarDesplazamientoGuardado(): void {
  if (typeof document === "undefined") return;
  const state = getState();
  state.restaurar = false;
  state.scrollY = 0;
  // El cuerpo fijado lleva la altura vieja en `top`: dejarla mueve la página
  // hacia abajo en cuanto se suelte el candado.
  if (document.body?.style.position === "fixed") document.body.style.top = "0px";
  state.previousTop = "";
}

export function recoverBodyScrollLock(): void {
  if (typeof document === "undefined" || !document.body) return;

  const state = getState();
  if (state.locks.size === 0) return;

  const hasVisibleModal = Boolean(
    document.querySelector(
      [
        '[role="dialog"][aria-modal="true"]',
        "[data-ai-concierge-dialog]",
        ".app-bottom-sheet",
      ].join(","),
    ),
  );

  if (hasVisibleModal) return;

  state.locks.clear();
  document.body.style.overflow = state.previousOverflow;
  document.body.style.position = state.previousPosition;
  document.body.style.top = state.previousTop;
  document.body.style.width = state.previousWidth;
  if (state.restaurar && state.scrollY > 0) window.scrollTo({ top: state.scrollY, left: 0, behavior: "instant" });
  state.previousOverflow = "";
  state.previousPosition = "";
  state.previousTop = "";
  state.previousWidth = "";
  state.scrollY = 0;
  state.restaurar = true;
}
