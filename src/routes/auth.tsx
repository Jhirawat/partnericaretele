import {pageHead,organizationLd,websiteLd} from "@/lib/seo";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { safeAuthDestination } from "@/lib/auth-destination";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  head: () => pageHead({ path: "/auth", index: false, thTitle: "เข้าสู่ระบบ", title: "Sign in", thDescription: "เข้าสู่ระบบพอร์ทัลพาร์ทเนอร์และทีมปฏิบัติการ", description: "Sign in to the partner and operations portal." }),
  validateSearch: (s: Record<string, unknown>): { next?: string | undefined; signup?: boolean } => {
    return { next: safeAuthDestination(s["next"]), signup: s["signup"] === true || s["signup"] === "true" };
  },
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { next, signup } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(signup ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  function goNext() {
    navigate({ to: safeAuthDestination(next) ?? "/portal", replace: true });
  }
  // Computed lazily in click handlers only — window is unavailable during SSR.
  function getReturnUrl() {
    return next
      ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
      : window.location.origin;
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getReturnUrl(),
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success(t("auth.checkEmail"));
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        goNext();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: getReturnUrl(),
    });
    if (result.error) {
      toast.error(t("common.error"));
      return;
    }
    if (result.redirected) return;
    goNext();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="brand-gradient inline-flex size-9 items-center justify-center rounded-xl text-sm font-semibold text-primary-foreground">
            TK
          </span>
          <span className="font-display text-sm font-semibold">{t("brand.name")}</span>
        </Link>
        <LanguageSwitcher className="h-9 w-[150px]" />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pb-20 pt-6">
        <div className="surface w-full max-w-md p-8">
          <h1 className="text-2xl font-semibold">{t(mode === "signup" ? "auth.signUp" : "auth.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
            </Button>
          </form>

          <Button variant="outline" className="mt-3 w-full" onClick={handleGoogle}>
            {t("auth.google")}
          </Button>

          <Button
            variant="ghost"
            type="button"
            className="mt-6 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? t("auth.toSignUp") : t("auth.toSignIn")}
          </Button>
          <Link to="/admin-auth" className="mt-4 block text-center text-sm underline">Staff sign in</Link>
        </div>
      </main>
    </div>
  );
}
