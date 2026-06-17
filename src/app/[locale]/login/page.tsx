"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMemo, useState } from "react";
import { ArrowRight, AlertCircle } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";

type FormData = { email: string; password: string };

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  // Built inside the component so the validation messages are localized.
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("emailInvalid")),
        password: z.string().min(1, t("passwordRequired")),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setSubmitting(false);
    if (authError) {
      // A common lockout: the email belongs to an account created with Google/
      // Facebook (no password set). Guide the user to the right method instead of
      // a dead-end "wrong password".
      setError(t("loginError"));
      return;
    }
    // Resolve the role AUTHORITATIVELY so every login lands on the right panel.
    // user_metadata.role is often missing/stale (it isn't set for every account),
    // which used to dump professionals onto the client panel — so fall back to the
    // profiles table, and finally to the existence of a professionals row.
    let role = authData.user?.user_metadata?.role as string | undefined;
    if (role !== "professional" && role !== "client" && authData.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .maybeSingle();
      role = (profile?.role as string | undefined) ?? role;
      if (!role) {
        const { data: pro } = await supabase
          .from("professionals")
          .select("id")
          .eq("profile_id", authData.user.id)
          .maybeSingle();
        if (pro) role = "professional";
      }
    }
    // Optional post-login destination (e.g. the "Publicar proyecto" CTA sends
    // logged-out users here with ?redirect=projects → land on the role-aware
    // projects section after authenticating). Read from the URL at submit time
    // (avoids a useSearchParams suspense boundary on this client page).
    const redirectParam = new URLSearchParams(window.location.search).get("redirect");
    const dest =
      redirectParam === "projects"
        ? role === "professional"
          ? "/dashboard/profesional?tab=sent_projects"
          : "/dashboard/cliente?tab=projects"
        : `/dashboard/${role === "professional" ? "profesional" : "cliente"}`;
    // Hard redirect so the new page loads with the session already in cookies,
    // preventing the navbar from flashing logged-out state.
    window.location.href = `/${locale}${dest}`;
  }

  // Carry the post-login destination through the OAuth round-trip via the callback's
  // `next` param (the callback resolves "projects" to the role-aware projects tab).
  function oauthCallbackUrl() {
    const wantsProjects = new URLSearchParams(window.location.search).get("redirect") === "projects";
    return window.location.origin + "/auth/callback" + (wantsProjects ? "?next=projects" : "");
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthCallbackUrl() },
    });
    setGoogleLoading(false);
  }

  async function handleFacebook() {
    setFacebookLoading(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: oauthCallbackUrl() },
    });
    setFacebookLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          {/* Same card container as the client ("Crear cuenta de cliente") and
              professional registrations — clean white card, hairline border, soft
              shadow, p-8 — so the whole auth flow (login + both signups) is consistent. */}
          <div className="bg-white rounded-3xl shadow-sm border border-[#e5e7eb] p-8">
          <div className="text-center mb-8">
            <ContrataCRLogo className="justify-center mb-4" />
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] text-sm mt-1">{t("subtitle")}</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label={t("email")}
              type="email"
              placeholder="tu@email.com"
              error={errors.email?.message}
              {...register("email")}
            />
            <div>
              <Input
                label={t("password")}
                type="password"
                placeholder="••••••••"
                error={errors.password?.message}
                {...register("password")}
              />
              <div className="flex justify-end mt-1">
                <Link href="/olvide-contrasena" className="text-xs text-[#009FD9] hover:underline">
                  {t("forgotPassword")}
                </Link>
              </div>
            </div>
            <Button type="submit" size="lg" loading={submitting} className="mt-2">
              {submitting ? t("submitting") : (
                <>
                  {t("submit")} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e5e7eb]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-xs text-[#9ca3af]">{t("or")}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || facebookLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-xl text-sm font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {googleLoading ? t("redirecting") : t("continueGoogle")}
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={handleFacebook}
              disabled={googleLoading || facebookLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white border border-[#1877F2] rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {facebookLoading ? t("redirecting") : t("continueFacebook")}
            </button>
          </div>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            {t("noAccount")}{" "}
            <Link href="/registro" className="text-[#009FD9] font-medium hover:underline">
              {t("signUp")}
            </Link>
          </p>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
