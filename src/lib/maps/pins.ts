// ONE map-marker design for every ContrataCR map (professionals results map, places results map, branch map, place
// mini map): the cyan teardrop with an optional number inside (rank of the card, or the count of a cluster), navy and
// 1.15x when selected or hovered, and the white mini-card popup. Owner decision 2026-11-21: places must look exactly like
// the professionals map. search-map-panel.tsx and places-map.tsx both import from here so they cannot drift.

export const PIN_BASE = "#009FD9";
export const PIN_HOVER = "#162543";

export const PIN_CSS =
  ".ccr-pin{display:block;width:30px;height:40px;padding:0;border:0;background:transparent;cursor:pointer;text-decoration:none;}" +
  ".ccr-pin:focus-visible{outline:none;}" +
  ".ccr-pin:focus-visible .ccr-pin-body{outline:3px solid " + PIN_HOVER + ";outline-offset:2px;border-radius:12px;}" +
  ".ccr-pin-body{position:relative;display:block;width:30px;height:40px;transform-origin:center bottom;transition:transform .15s ease;}" +
  ".ccr-pin svg{display:block;width:30px;height:40px;filter:drop-shadow(0 2px 3px rgba(15,23,42,.35));}" +
  ".ccr-pin path{transition:fill .15s ease;}" +
  ".ccr-pin .num{position:absolute;top:6px;left:0;right:0;text-align:center;color:#fff;font:700 12px/1 Inter,system-ui,sans-serif;}" +
  ".ccr-pin .num.is-long{font-size:10px;top:7px;}" +
  ".ccr-pin.is-active .ccr-pin-body,.ccr-pin:hover .ccr-pin-body{transform:scale(1.15);}" +
  ".ccr-pin.is-active path,.ccr-pin:hover path{fill:" + PIN_HOVER + ";}" +
  ".ccr-pin[role=img]{cursor:default;}" +
  ".ccr-popwrap{pointer-events:none;}" +
  ".ccr-pop{pointer-events:auto;position:relative;width:min(248px,calc(100vw - 32px));background:#fff;border-radius:14px;box-shadow:0 10px 30px -8px rgba(15,23,42,.30),0 2px 6px rgba(15,23,42,.10);padding:12px;font-family:Inter,system-ui,sans-serif;text-decoration:none;display:block;cursor:pointer;}" +
  ".ccr-pop-x{position:absolute;top:6px;right:6px;width:22px;height:22px;border:0;background:transparent;color:#9ca3af;font-size:16px;line-height:1;cursor:pointer;border-radius:6px;}" +
  ".ccr-pop-x:hover{background:#f3f4f6;color:#374151;}" +
  ".ccr-pop-top{display:flex;gap:10px;align-items:flex-start;}" +
  ".ccr-av{position:relative;width:42px;height:42px;border-radius:9999px;overflow:hidden;background:#EBF5FB;color:#009FD9;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;}" +
  ".ccr-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}" +
  ".ccr-pop-name{font-weight:700;color:#111827;font-size:14px;line-height:1.2;padding-right:18px;display:flex;align-items:center;gap:4px;min-width:0;}" +
  ".ccr-pop-name-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
  ".ccr-ver{display:inline-flex;flex:none;width:24px;height:24px;color:#009FD9;border:0;background:transparent;align-items:center;justify-content:center;cursor:pointer;}" +
  ".ccr-ver svg{display:block;width:14px;height:14px;}" +
  ".ccr-pop-prof{display:flex;align-items:center;gap:4px;color:#6b7280;font-size:12px;margin-top:2px;line-height:1.3;}" +
  ".ccr-pop-more{display:inline-flex;align-items:center;font-size:10px;font-weight:800;color:#526277;line-height:1;}" +
  ".ccr-pop-rate{display:flex;align-items:center;gap:3px;font-size:12px;margin-top:4px;color:#5f6f86;font-weight:600;line-height:1;}" +
  ".ccr-pop-rate .star{color:#f59e0b;font-weight:800;}" +
  ".ccr-pop-rate .score{color:#162543;font-weight:800;}" +
  ".ccr-pop-rate .count{color:#5f6f86;font-weight:600;}" +
  ".ccr-pop-price{font-size:12.5px;font-weight:700;color:" + PIN_BASE + ";margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;}" +
  ".ccr-pop-price.is-compact{margin-top:3px;}" +
  // MapLibre attribution: compact «i» that keeps OpenStreetMap/OpenFreeMap credit readable.
  ".ccr-map .maplibregl-ctrl-attrib,.ccr-pmap .maplibregl-ctrl-attrib{font:11px/1.4 Inter,system-ui,sans-serif;}" +
  ".ccr-map .maplibregl-ctrl-attrib a,.ccr-pmap .maplibregl-ctrl-attrib a{color:#334155;}";

export function pinSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32" aria-hidden="true" focusable="false">` +
    `<path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="${PIN_BASE}" stroke="#ffffff" stroke-width="1.5"/></svg>`
  );
}

/** THE shared marker: a real <button> or <a> (keyboard + screen reader), the same teardrop for every result. */
export function teardropEl(num: string | number, label: string, tag: "button" | "a" = "button"): HTMLElement {
  const el = document.createElement(tag);
  if (tag === "button") (el as HTMLButtonElement).type = "button";
  el.className = "ccr-pin";
  el.setAttribute("aria-label", label);
  const text = String(num);
  el.innerHTML = `<span class="ccr-pin-body">${pinSvg()}${text !== "" ? `<span class="num${text.length > 3 ? " is-long" : ""}" aria-hidden="true">${text}</span>` : ""}</span>`;
  return el;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
export function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
