import { getTranslations } from "next-intl/server";
import { ArrowRight, Shield, Star, Search, Zap, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroSearch } from "@/components/search/hero-search";
import { ProfessionalCard } from "@/components/professionals/professional-card";
import { Button } from "@/components/ui/button";
import { CATEGORIES } from "@/lib/data/cr-geography";
import { MOCK_PROFESSIONALS } from "@/lib/data/mock-professionals";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tCat = await getTranslations("categories");

  const featured = MOCK_PROFESSIONALS.filter((p) => p.isFeatured);
  const topRated = [...MOCK_PROFESSIONALS].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 3);
  const showcased = [...new Map([...featured, ...topRated].map((p) => [p.id, p])).values()].slice(0, 6);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0c2420] via-[#183f36] to-[#1e5e4f] py-20 sm:py-28">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#319278]/20 blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-[#ff7c0a]/10 blur-3xl translate-y-1/2 -translate-x-1/3" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2 mb-6">
            <span className="text-base">🇨🇷</span>
            <span className="text-white/90 text-sm font-medium">{t("hero.badge")}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-4">
            {t("hero.title")}{" "}
            <span className="text-[#53ae96]">{t("hero.titleHighlight")}</span>
            <br className="hidden sm:block" /> {t("hero.titleSuffix")}
          </h1>
          <p className="text-lg sm:text-xl text-white/70 mb-10 max-w-2xl mx-auto">
            {t("hero.subtitle")}
          </p>
          <HeroSearch />
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {CATEGORIES.slice(0, 6).map((cat) => (
              <Link
                key={cat.id}
                href={`/buscar?categoria=${cat.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20 transition-colors"
              >
                {cat.icon} {tCat(cat.id)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-[#e5e7eb]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { value: "500+", label: t("stats.professionals") },
              { value: "7", label: t("stats.provinces") },
              { value: "4.8 ★", label: t("stats.rating") },
              { value: "2,000+", label: t("stats.jobs") },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-[#319278]">{stat.value}</div>
                <div className="text-xs sm:text-sm text-[#6b7280] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 bg-[#fafafa]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">{t("categories.title")}</h2>
            <p className="text-[#6b7280] mt-2">{t("categories.subtitle")}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.id}
                href={`/buscar?categoria=${cat.id}`}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-5 hover:border-[#319278] hover:shadow-md transition-all duration-200"
              >
                <span className="text-3xl group-hover:scale-110 transition-transform duration-200">{cat.icon}</span>
                <span className="text-sm font-medium text-[#374151] text-center group-hover:text-[#319278] transition-colors">
                  {tCat(cat.id)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">{t("featured.title")}</h2>
              <p className="text-[#6b7280] mt-1">{t("featured.subtitle")}</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/buscar" className="flex items-center gap-1">
                {t("featured.viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {await Promise.all(showcased.map((pro) => (
              <ProfessionalCard key={pro.id} professional={pro} />
            )))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-[#f0f9f6]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">{t("howItWorks.title")}</h2>
            <p className="text-[#6b7280] mt-2 max-w-xl mx-auto">{t("howItWorks.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: <Search className="h-7 w-7 text-[#319278]" />, title: t("howItWorks.step1.title"), desc: t("howItWorks.step1.desc") },
              { step: "02", icon: <Star className="h-7 w-7 text-[#319278]" />, title: t("howItWorks.step2.title"), desc: t("howItWorks.step2.desc") },
              { step: "03", icon: <Zap className="h-7 w-7 text-[#319278]" />, title: t("howItWorks.step3.title"), desc: t("howItWorks.step3.desc") },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="relative inline-flex">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-[#e5e7eb]">{item.icon}</div>
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#319278] text-white text-xs font-bold">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-[#111827] mt-4 mb-2">{item.title}</h3>
                <p className="text-sm text-[#6b7280] leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: <Shield className="h-8 w-8 text-[#319278]" />, title: t("trust.cedula.title"), desc: t("trust.cedula.desc") },
              { icon: <Star className="h-8 w-8 text-[#ff9b32]" />, title: t("trust.reviews.title"), desc: t("trust.reviews.desc") },
              { icon: <Users className="h-8 w-8 text-[#319278]" />, title: t("trust.community.title"), desc: t("trust.community.desc") },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 p-6 rounded-2xl border border-[#e5e7eb] hover:border-[#bbe2d5] transition-colors">
                <div className="shrink-0">{item.icon}</div>
                <div>
                  <h3 className="font-semibold text-[#111827] mb-1">{item.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pro CTA */}
      <section className="py-16 bg-gradient-to-br from-[#0c2420] to-[#237561]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{t("cta.title")}</h2>
          <p className="text-white/70 mb-8 max-w-xl mx-auto text-sm sm:text-base">{t("cta.subtitle")}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="xl" variant="accent" asChild>
              <Link href="/registro/profesional">
                {t("cta.button")} <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button size="xl" className="border-2 border-white bg-transparent text-white hover:bg-white/10" asChild>
              <Link href="/como-funciona">{t("cta.learnMore")}</Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-8">
            {[t("cta.feature1"), t("cta.feature2"), t("cta.feature3"), t("cta.feature4")].map((f) => (
              <span key={f} className="text-xs sm:text-sm text-white/70">{f}</span>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
