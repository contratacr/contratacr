import { expect, test } from "playwright/test";
import type { CampaignHistory } from "../../src/lib/email/campaign-policy";
import {
  FOLLOWUP_ENABLED_KINDS, FOLLOWUP_CATALOG, followupCandidate, followupWindows, proSummaryEmail, clientNewProsEmail,
  type FollowupContext,
} from "../../src/lib/email/seguimiento-policy";

// 5 de noviembre de 2026, 9 a. m. en Costa Rica: dentro de la ventana mensual.
const nov5 = Date.UTC(2026, 10, 5, 15);
const dec3 = Date.UTC(2026, 11, 3, 15);
const apr25 = Date.UTC(2027, 3, 25, 15);
const nov20 = Date.UTC(2026, 10, 20, 15);
const ago = (now: number, d: number) => new Date(now - d * 86_400_000).toISOString();
const sent = (now: number, campana: string, d: number, extra: Partial<CampaignHistory> = {}): CampaignHistory =>
  ({ email: "a@example.com", campana, enviado_en: ago(now, d), status: "sent", ...extra });

const proData = { views: 12, contacts: 2, searchers: 7, serviceName: "electricidad", hasReviews: false, hasPhotos: true, hasPrice: true };
const pro = (now: number, extra: Partial<FollowupContext> = {}): FollowupContext => ({
  professional: true, accountAgeDays: 90, onboardingDone: true, lastActiveAt: Date.parse(ago(now, 20)),
  history: [], unsubscribed: false, pro: proData, ...extra,
});
const client = (now: number, extra: Partial<FollowupContext> = {}): FollowupContext => ({
  professional: false, accountAgeDays: 90, onboardingDone: true, lastActiveAt: Date.parse(ago(now, 40)),
  history: [], unsubscribed: false,
  client: { reviewAsk: null, province: { id: "1", name: "San José", newPros: 4, services: ["electricidad", "pintura", "limpieza"] } }, ...extra,
});
const pick = (ctx: FollowupContext, now: number) => followupCandidate(ctx, now, true)?.key;

test("solo salen los aprobados: diciembre y la reseña; el resto sigue apagado", () => {
  expect([...FOLLOWUP_ENABLED_KINDS].sort()).toEqual(["seg-cli-diciembre", "seg-cli-resena", "seg-pro-diciembre"]);
  expect(followupCandidate(pro(nov5), nov5)).toBeNull();
  expect(followupCandidate(client(nov5), nov5)).toBeNull();
  expect(followupCandidate(client(apr25), apr25)).toBeNull();
  expect(followupCandidate(pro(dec3), dec3)?.key).toBe("seg-pro-diciembre-2026");
  expect(followupCandidate(client(dec3), dec3)?.key).toBe("seg-cli-diciembre-2026");
  const ask = { id: "f9", professionalName: "Ana Mora", serviceName: null };
  expect(followupCandidate(client(nov20, { client: { reviewAsk: ask, province: null } }), nov20)?.key).toBe("seg-cli-resena-f9");
});

test("ventanas: días 1 a 10, del 1 al 12 de diciembre y del 20 al 30 de abril", () => {
  expect(followupWindows(nov5)).toMatchObject({ mensual: true, diciembre: false, lluvias: false, period: "2026-11" });
  expect(followupWindows(nov20).any).toBe(false);
  expect(followupWindows(dec3)).toMatchObject({ mensual: false, diciembre: true });
  expect(followupWindows(apr25)).toMatchObject({ lluvias: true });
  expect(pick(pro(nov20), nov20)).toBeUndefined();
});

test("30 días desde cualquier correo de campaña, bienvenida incluida", () => {
  expect(pick(client(nov5, { history: [sent(nov5, "crear-proyecto-clientes-2026", 29)] }), nov5)).toBeUndefined();
  expect(pick(client(nov5, { history: [sent(nov5, "crear-proyecto-clientes-2026", 30)] }), nov5)).toBe("seg-cli-nuevos-2026-11");
});

test("bienvenida pendiente, cuenta nueva, baja o envío dudoso: no hay seguimiento", () => {
  expect(pick(client(nov5, { onboardingDone: false }), nov5)).toBeUndefined();
  expect(pick(client(nov5, { accountAgeDays: 20 }), nov5)).toBeUndefined();
  expect(pick(client(nov5, { unsubscribed: true }), nov5)).toBeUndefined();
  expect(pick(client(nov5, { history: [sent(nov5, "otra", 60, { status: "uncertain" })] }), nov5)).toBeUndefined();
  expect(pick(client(nov5, { history: [sent(nov5, "otra", 60, { rebote_en: ago(nov5, 59) })] }), nov5)).toBeUndefined();
});

test("regla de salida: tres seguimientos seguidos sin clic pausan seis meses", () => {
  const tres = [sent(nov5, "seg-cli-nuevos-2026-08", 90), sent(nov5, "seg-cli-nuevos-2026-09", 60), sent(nov5, "seg-cli-nuevos-2026-10", 35)];
  expect(pick(client(nov5, { history: tres }), nov5)).toBeUndefined();
  const conClic = [...tres.slice(0, 2), { ...tres[2], click_en: ago(nov5, 34) }];
  expect(pick(client(nov5, { history: conClic }), nov5)).toBe("seg-cli-nuevos-2026-11");
});

test("quien usó la app en los últimos 14 días no recibe empujones", () => {
  expect(pick(client(nov5, { lastActiveAt: Date.parse(ago(nov5, 5)) }), nov5)).toBeUndefined();
  expect(pick(pro(nov5, { lastActiveAt: Date.parse(ago(nov5, 5)) }), nov5)).toBeUndefined();
});

test("pedir la reseña va primero y aunque la persona esté activa", () => {
  const ask = { id: "f1", professionalName: "Juan Pérez", serviceName: "fontanería" };
  const ctx = client(nov20, { lastActiveAt: Date.parse(ago(nov20, 1)), client: { reviewAsk: ask, province: null } });
  const f = followupCandidate(ctx, nov20, true)!;
  expect(f.key).toBe("seg-cli-resena-f1");
  expect(f.subject).toBe("¿Cómo le fue con Juan Pérez?");
  expect(f.ctaLabel).toBe("Dejar una reseña");
  expect(pick({ ...ctx, history: [sent(nov20, "seg-cli-resena-f1", 40)] }, nov20)).toBeUndefined();
});

test("clientes: diciembre y lluvias por temporada; nuevos profesionales solo con 3 o más", () => {
  expect(pick(client(dec3), dec3)).toBe("seg-cli-diciembre-2026");
  expect(pick(client(apr25), apr25)).toBe("seg-cli-lluvias-2027");
  expect(pick(client(nov5, { client: { reviewAsk: null, province: { id: "1", name: "Heredia", newPros: 2, services: [] } } }), nov5)).toBeUndefined();
  expect(pick(client(nov5, { client: { reviewAsk: null, province: null } }), nov5)).toBeUndefined();
});

test("profesionales: diciembre reemplaza al resumen; búsquedas solo si lleva 60 días sin entrar", () => {
  expect(pick(pro(dec3), dec3)).toBe("seg-pro-diciembre-2026");
  expect(pick(pro(nov5), nov5)).toBe("seg-pro-resumen-2026-11");
  expect(pick(pro(nov5, { lastActiveAt: Date.parse(ago(nov5, 61)) }), nov5)).toBe("seg-pro-busquedas-2026-11");
  expect(pick(pro(nov5, { lastActiveAt: Date.parse(ago(nov5, 61)), pro: { ...proData, searchers: 4 } }), nov5)).toBe("seg-pro-resumen-2026-11");
  expect(pick(pro(nov5, { pro: { ...proData, views: 0 } }), nov5)).toBeUndefined();
  expect(pick(pro(nov5, { pro: undefined }), nov5)).toBeUndefined();
});

test("los textos usan los datos reales, usted y comillas rectas", () => {
  const resumen = proSummaryEmail("2026-11", { ...proData, views: 1, contacts: 0 });
  expect(resumen.body).toContain("su perfil tuvo 1 visita.");
  expect(resumen.body).toContain("Pedir una reseña");
  const nuevos = clientNewProsEmail("2026-11", { id: "1", name: "Cartago", newPros: 5, services: ["pintura", "limpieza", "electricidad", "jardinería"] });
  expect(nuevos.body).toContain("5 profesionales en Cartago, en servicios como pintura, limpieza y electricidad.");
  for (const f of [resumen, nuevos]) expect(`${f.subject} ${f.body}`).not.toMatch(/[«»“”]|\btú\b|\btienes\b|\bpuedes\b/);
  expect(FOLLOWUP_CATALOG).toHaveLength(7);
});
