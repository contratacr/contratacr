import { expect, test } from "playwright/test";
import { notificationActionHref, notificationActionLabel } from "../../src/lib/notification-link";
import { localizedNotificationCopy } from "../../src/lib/localized-notification";

for (const locale of ["es", "en"]) {
  test(`notification actions describe the destination and avoid self-links (${locale})`, () => {
    const removed = { type: "counterparty_account_deleted" };
    expect(notificationActionHref(removed, undefined, locale)).toContain("tab=soporte");
    expect(notificationActionLabel(removed, undefined, locale)).toBe(locale === "es" ? "Contactar soporte" : "Contact support");
    expect(localizedNotificationCopy({ ...removed, title: "Legacy long title", message: "" }, locale).title).toBe(locale === "es" ? "Cuenta eliminada" : "Account deleted");
    for (const [type, link, es, en] of [
      ["direct_message", "/mensajes?conversation=test", "Abrir conversación", "Open conversation"],
      ["support_reply", "/dashboard/profesional?tab=soporte", "Abrir soporte", "Open support"],
      ["new_job", "/empleos/123", "Ver empleo", "View job"],
      ["new_project", "/proyectos/123", "Ver proyecto", "View project"],
      ["agrega_precio", "/dashboard/profesional?tab=completion", "Agregar un precio", "Add a price"],
    ]) expect(notificationActionLabel({ type, data: { link } }, undefined, locale)).toBe(locale === "es" ? es : en);
    expect(notificationActionLabel({ type: "suggestion_rejected" }, undefined, locale)).toBeNull();
    expect(notificationActionLabel({ type: "unknown_legacy" }, undefined, locale)).toBeNull();
    expect(notificationActionLabel({ type: "direct_message" }, undefined, locale)).toBeNull();
  });
}
