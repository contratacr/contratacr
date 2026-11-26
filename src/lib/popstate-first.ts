// Handlers that must see a history traversal before Next's router does (to block it or to adjust event.state).
// On `window` the browser calls popstate listeners in registration order, capture or not: `window` is the event's
// target, and there is no capture phase in front of it. Next registers its listener when the app router hydrates.
// A Pro module that a lazily loaded chunk evaluates after that comes too late, so a dirty editor's guard was never
// asked, and the back button discarded its edits (CI run 45756930540: unsaved visit-preparation settings on mobile).
// This module is imported by the root layout's RouteScrollReset, so its single listener is registered while the
// page hydrates, before Next's. Handlers run in the order they were added. A handler that calls
// event.stopImmediatePropagation() also stops the handlers after it, and stops Next's listener.
type Handler = (event: PopStateEvent) => void;
const handlers: Handler[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("popstate", (event) => {
    for (const handler of [...handlers]) {
      handler(event);
      if (event.cancelBubble) break;
    }
  });
}
export function onPopstateFirst(handler: Handler) {
  if (!handlers.includes(handler)) handlers.push(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}
