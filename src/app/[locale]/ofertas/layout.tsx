import { MarketplaceSectionLayoutShell } from "@/components/marketplace/marketplace-section-layout-shell";

export default function OffersLayout({ children }: { children: React.ReactNode }) {
  return <MarketplaceSectionLayoutShell>{children}</MarketplaceSectionLayoutShell>;
}
