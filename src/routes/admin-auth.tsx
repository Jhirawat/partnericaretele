import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkStaffAccess } from "@/lib/staff-access.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CareMfa } from "@/components/CareMfa";

export const Route = createFileRoute("/admin-auth")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Staff sign in — iCareTele" }, { name: "description", content: "Private sign in for owner-provisioned staff accounts." },
    { property: "og:title", content: "Staff sign in — iCareTele" }, { property: "og:description", content: "Secure staff sign in with independent role validation." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: StaffSignIn,
});

function StaffSignIn() {
  const navigate = useNavigate();
  const check = useServerFn(checkStaffAccess);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  async function continueSignIn() {
    const result = await check({ data: { scope: "staff" } });
    setState(result);
    if (result === "ALLOWED") await navigate({ to: "/dashboard", replace: true });
  }
  return <main className="mx-auto min-h-screen max-w-md space-y-6 px-6 py-12">
    <h1 className="font-display text-2xl font-semibold">Staff sign in</h1>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setState("");
      try {
        const result = await supabase.auth.signInWithPassword({ email, password });
        setPassword("");
        if (result.error) { setState("SIGN_IN_FAILED"); return; }
        await continueSignIn();
      } catch { setState("SIGN_IN_FAILED"); } finally { setBusy(false); }
    }}>
      <Label htmlFor="staff-email">Staff email</Label><Input id="staff-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
      <Label htmlFor="staff-password">Password</Label><Input id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      <Button disabled={busy || state === "MFA_REQUIRED"} className="w-full">Sign in</Button>
    </form>
    {state === "MFA_REQUIRED" && <><CareMfa onVerified={() => void continueSignIn()} /><Button onClick={() => void continueSignIn()}>Continue after verification</Button></>}
    {state === "RESET_REQUIRED" && <p role="status">A password change is required before staff access. Use the owner-provided invitation or recovery link. <Link to="/reset-password" className="underline">Change password</Link></p>}
    {["DENIED", "SIGN_IN_FAILED"].includes(state) && <p role="alert" className="text-destructive">Staff access is unavailable for this account.</p>}
    <section className="space-y-2 border-t border-border pt-5 text-sm text-muted-foreground">
      <h2 className="font-semibold text-foreground">Owner provisioning required</h2>
      <p>No staff signup is available. The owner must provision the first Superadmin through Lovable Cloud’s secure Users console and an approved role grant. New staff must change their password and enroll an authenticator before access.</p>
    </section>
    <Link to="/auth" className="block text-sm underline">Customer and partner sign in</Link>
  </main>;
}
