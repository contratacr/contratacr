"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight, User, Briefcase } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Card, CardContent } from "@/components/ui/card";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function RegisterPage() {
  const t = useTranslations("auth.register");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] mt-2">{t("subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/registro/cliente">
              <Card className="h-full cursor-pointer hover:border-[#009FD9] hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-6 text-center">
                  <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-[#EBF5FB] mb-4 group-hover:bg-[#bfdbfe] transition-colors">
                    <User className="h-7 w-7 text-[#009FD9]" />
                  </div>
                  <h2 className="font-semibold text-[#111827] mb-2">{t("client")}</h2>
                  <p className="text-sm text-[#6b7280]">{t("clientDesc")}</p>
                  <div className="flex items-center justify-center gap-1 mt-4 text-sm text-[#009FD9] font-medium">
                    {t("register")} <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/registro/profesional">
              <Card className="h-full cursor-pointer hover:border-[#ff7c0a] hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-6 text-center">
                  <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-[#fff8ed] mb-4 group-hover:bg-[#ffdba5] transition-colors">
                    <Briefcase className="h-7 w-7 text-[#ff7c0a]" />
                  </div>
                  <h2 className="font-semibold text-[#111827] mb-2">{t("professional")}</h2>
                  <p className="text-sm text-[#6b7280]">{t("professionalDesc")}</p>
                  <div className="flex items-center justify-center gap-1 mt-4 text-sm text-[#ff7c0a] font-medium">
                    {t("register")} <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            {t("alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-[#009FD9] font-medium hover:underline">{t("signIn")}</Link>
          </p>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
