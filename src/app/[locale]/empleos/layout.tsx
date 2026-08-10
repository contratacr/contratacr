import { MarketplaceSectionLayoutShell } from "@/components/marketplace/marketplace-section-layout-shell";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <MarketplaceSectionLayoutShell>{children}</MarketplaceSectionLayoutShell>;
}
