import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const appRoot = resolve(root, "src/app");
const e2eRoot = resolve(root, "tests/e2e");

const pageRules = [
  [/^\/\[locale\]\/admin(?:\/|$)/, "admin-smoke.spec.ts"],
  [/^\/\[locale\]\/dashboard(?:\/|$)/, "dashboard-surfaces.spec.ts"],
  // The editors (publish, edit, owner managers) are exercised through their real screens.
  [/^\/\[locale\]\/(?:empleos|ofertas)\/(?:publicar|\[id\]\/editar|mis-empleos|mis-ofertas)$/, "marketplace-editors.spec.ts"],
  [/^\/\[locale\]\/(?:empleos|ofertas)(?:\/|$)/, "marketplace-lifecycle.spec.ts"],
  [/^\/\[locale\]\/profesionales(?:\/|$)/, "professional-profile.spec.ts"],
  [/^\/\[locale\]\/notificaciones$/, "notifications-guides-regression.spec.ts"],
  [/^\/\[locale\]\/mensajes$/, "direct-chat.spec.ts", true],
  // Role choice, onboarding hand-off, profile completion and the recovery link are driven on the real pages.
  [/^\/\[locale\]\/(?:registro|reset-password|onboarding|completar-perfil)$/, "auth-screens.spec.ts"],
  [/^\/\[locale\]\/(?:login|registro|olvide-contrasena|reset-password|onboarding|completar-perfil)(?:\/|$)/, "auth-support.spec.ts"],
  [/^\/\[locale\]\/eliminar-cuenta$/, "account-lifecycle.spec.ts"],
  [/^\/\[locale\](?:\/|$)/, "public-smoke.spec.ts"],
  [/^\/$/, "public-smoke.spec.ts"],
];

const handlerRules = [
  [/^\/auth\/callback$/, "product-contract.spec.ts"],
  [/^\/api\/admin(?:\/|$)/, "admin-smoke.spec.ts"],
  [/^\/api\/ai-assistant(?:\/|$)/, "ai-assistant.spec.ts"],
  [/^\/api\/account(?:\/|$)/, "account-lifecycle.spec.ts"],
  [/^\/api\/auth(?:\/|$)/, "auth-support.spec.ts"],
  [/^\/api\/(?:bookings|projects|proposals|reviews|support)(?:\/|$)/, "seeded-regression.spec.ts"],
  [/^\/api\/(?:jobs|offers)(?:\/|$)/, "marketplace-lifecycle.spec.ts"],
  [/^\/api\/direct-chat(?:\/|$)/, "direct-chat.spec.ts", true],
  [/^\/api\/(?:push|internal\/push)(?:\/|$)/, "push-outbox-contract.spec.ts"],
  [/^\/api\/payments(?:\/|$)/, "product-contract.spec.ts"],
  [/^\/api\/(?:search|categories|insurers)(?:\/|$)/, "api-smoke.spec.ts"],
  [/^\/api\/contact(?:\/|$)/, "whatsapp-review-followup.spec.ts"],
  [/^\/api\/upload(?:\/|$)/, "extended-lifecycle.spec.ts"],
  [/^\/api\/(?:register|cedula|cedula-available|add-cedula|verify-identity)(?:\/|$)/, "product-contract.spec.ts"],
  [/^\/api\/(?:appeals|report|report-client|report-professional|portfolio-like|professional-followers|client\/connections)(?:\/|$)/, "interaction-surfaces.spec.ts"],
  [/^\/api\/(?:public-availability|check-availability|professionals)(?:\/|$)/, "search-results.spec.ts"],
  [/^\/api\/(?:analytics|translate)(?:\/|$)/, "product-contract.spec.ts"],
  [/^\/api\/health$/, "health.spec.ts"],
];

function filesNamed(directory, fileName) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesNamed(path, fileName) : entry.name === fileName ? [path] : [];
  });
}

function appRoute(file, terminal) {
  const path = relative(appRoot, file).replaceAll("\\", "/");
  const withoutTerminal = path === terminal ? "" : path.slice(0, -(terminal.length + 1));
  return `/${withoutTerminal}`;
}

function verify(routes, rules, kind) {
  const parked = [];
  for (const route of routes) {
    const rule = rules.find(([match]) => match.test(route));
    if (!rule) throw new Error(`${kind} ${route} has no regression owner.`);
    const [, owner, isParked] = rule;
    if (!existsSync(resolve(e2eRoot, owner))) {
      throw new Error(`${kind} ${route} points to missing tests/e2e/${owner}.`);
    }
    if (isParked) parked.push(route);
  }
  return parked;
}

const pages = filesNamed(appRoot, "page.tsx").map((file) => appRoute(file, "page.tsx")).sort();
const handlers = filesNamed(appRoot, "route.ts").map((file) => appRoute(file, "route.ts")).sort();

if (!pages.length || !handlers.length) throw new Error("Application surface inventory is unexpectedly empty.");

const parkedPages = verify(pages, pageRules, "Page");
const parkedHandlers = verify(handlers, handlerRules, "Handler");
const expectedParkedPages = ["/[locale]/mensajes"];
const expectedParkedHandlers = ["/api/direct-chat", "/api/direct-chat/attachments"];

if (JSON.stringify(parkedPages) !== JSON.stringify(expectedParkedPages)) {
  throw new Error(`Parked pages changed: ${JSON.stringify(parkedPages)}.`);
}
if (JSON.stringify(parkedHandlers) !== JSON.stringify(expectedParkedHandlers)) {
  throw new Error(`Parked handlers changed: ${JSON.stringify(parkedHandlers)}.`);
}

console.log(`Verified regression ownership for ${pages.length} pages and ${handlers.length} route handlers.`);
