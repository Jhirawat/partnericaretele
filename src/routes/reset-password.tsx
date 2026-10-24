import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({ staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Change password — iCareTele" }, { name: "description", content: "Secure account password recovery and required staff password change." }, { property: "og:title", content: "Change password — iCareTele" }, { property: "og:description", content: "Private password recovery." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }), component: ResetPassword });
function ResetPassword() {
  const [recovery, setRecovery] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const type = new URLSearchParams(window.location.hash.slice(1)).get("type"); setRecovery(type === "recovery" || type === "invite"); }, []);
  return <main className="mx-auto min-h-screen max-w-md space-y-6 px-6 py-12"><h1 className="text-2xl font-semibold">Change password</h1>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true);
      try {
        const user = await supabase.auth.getUser();
        if (!user.data.user) { setStatus("Use a valid invitation or recovery link, or sign in first."); return; }
        const result = await supabase.auth.updateUser(recovery ? { password } : { password, current_password: current });
        setPassword(""); setCurrent(""); setStatus(result.error ? "Password could not be changed." : "Password changed. Return to staff sign in to verify your authenticator.");
      } catch { setStatus("Password could not be changed."); } finally { setBusy(false); }
    }}>
      {!recovery && <><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} /></>}
      <Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
      <Button disabled={busy}>Save password</Button>
    </form>{status && <p role="status">{status}</p>}<Link to="/admin-auth" className="underline">Staff sign in</Link></main>;
}