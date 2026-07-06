type BodyScrollLockState = {
  locks: Set<symbol>;
  previousOverflow: string;
};

declare global {
  // Kept on globalThis so HMR/remounts do not lose the current lock state in dev.
  // eslint-disable-next-line no-var
  var __CONTRATACR_BODY_SCROLL_LOCK__: BodyScrollLockState | undefined;
}

function getState(): BodyScrollLockState {
  globalThis.__CONTRATACR_BODY_SCROLL_LOCK__ ??= {
    locks: new Set<symbol>(),
    previousOverflow: "",
  };
  return globalThis.__CONTRATACR_BODY_SCROLL_LOCK__;
}

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined" || !document.body) return () => {};

  const state = getState();
  const token = Symbol("body-scroll-lock");

  if (state.locks.size === 0) {
    state.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  state.locks.add(token);

  return () => {
    if (!state.locks.delete(token)) return;

    if (state.locks.size === 0 && document.body) {
      document.body.style.overflow = state.previousOverflow;
      state.previousOverflow = "";
    }
  };
}
