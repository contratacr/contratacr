"use client";
import { createContext, useContext, type ReactNode } from "react";

// Launch flags read on the SERVER ([locale]/layout.tsx) and handed to client components such as the navbar
// (2026-11-18). `directorySections` lists the public directory sections that are on (empty while DIR_ENABLED is off;
// without «salud» while DIR_HEALTH_ENABLED is off), so no menu links to a page that answers 404.
export type SiteFeatures = { directorySections: readonly string[] };
const SiteFeaturesContext = createContext<SiteFeatures>({ directorySections: [] });

export function SiteFeaturesProvider({ value, children }: { value: SiteFeatures; children: ReactNode }) {
  return <SiteFeaturesContext.Provider value={value}>{children}</SiteFeaturesContext.Provider>;
}
export function useSiteFeatures(): SiteFeatures {
  return useContext(SiteFeaturesContext);
}
