"use client";

import type { ReactNode } from "react";
import { IntlErrorCode, NextIntlClientProvider } from "next-intl";
import { humanizeMessageKey } from "@/i18n/message-fallback";

export function AppIntlProvider({ children, messages, locale }: { children: ReactNode; messages: Record<string, unknown>; locale: string }) {
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="America/Costa_Rica"
      messages={messages}
      onError={(error) => {
        if (error.code === IntlErrorCode.MISSING_MESSAGE) {
          if (process.env.NODE_ENV !== "production") console.warn(error.message);
          return;
        }
        console.error(error);
      }}
      getMessageFallback={({ namespace, key }) => {
        const path = namespace ? `${namespace}.${key}` : key;
        if (process.env.NODE_ENV !== "production") console.warn(`[i18n] Missing client message: ${path}`);
        return humanizeMessageKey(key);
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
