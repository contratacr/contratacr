type BodyScrollLockState = {
  locks: Set<symbol>;
  previousOverflow: string;
  previousPosition: string;
  previousTop: string;
  previousWidth: string;
  scrollY: number;
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
  };
  // Older HMR instances may still carry the smaller pre-keyboard state shape.
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.previousPosition ??= "";
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.previousTop ??= "";
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.previousWidth ??= "";
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__.scrollY ??= 0;
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
      window.scrollTo({ top: state.scrollY, left: 0, behavior: "instant" });
      state.previousOverflow = "";
      state.previousPosition = "";
      state.previousTop = "";
      state.previousWidth = "";
      state.scrollY = 0;
    }
  };
}
