import { getRequestConfig } from "next-intl/server";
import { IntlErrorCode } from "next-intl";
import { routing } from "./routing";
import { humanizeMessageKey } from "./message-fallback";

// Humanize a message key so a MISSING translation never shows the raw dotted path
// (e.g. "categories.reparacion_electrodomesticos") to the user. We strip the
// namespace prefix and turn the leaf into readable Title-ish text.
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "es" | "en")) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    timeZone: "America/Costa_Rica",
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Safety net: a missing message renders a readable label, NEVER "namespace.key".
    getMessageFallback({ namespace, key }) {
      const path = namespace ? `${namespace}.${key}` : key;
      // eslint-disable-next-line no-console
      console.warn(`[i18n] missing message "${path}"; showing "${humanizeMessageKey(key)}"`);
      return humanizeMessageKey(key);
    },
    onError(error) {
      // Missing messages are already surfaced by getMessageFallback's warn; don't
      // also throw/error-log them. Everything else is a real error.
      if (error.code === IntlErrorCode.MISSING_MESSAGE) return;
      // eslint-disable-next-line no-console
      console.error(error);
    },
  };
});
