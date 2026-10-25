import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCopy } from "@/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
/** Authenticator material exists only in browser state; never log it. */
export function CareMfa({ onVerified }: { onVerified?: () => void }) {
  const { c } = useCopy();
  const [level, setLevel] = useState("aal1");
  const [factor, setFactor] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    void (async () => {
      const [aal, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (!current) return;
      if (aal.data) setLevel(aal.data.currentLevel ?? "aal1");
      const verified = factors.data?.totp.find((f) => f.status === "verified");
      if (verified) setFactor(verified.id);
    })();
    return () => {
      current = false;
    };
  }, []);
  if (level === "aal2")
    return (
      <p className="rounded-lg bg-secondary p-3 text-sm">
        {c(
          "ยืนยันตัวตนขั้นสูงแล้วสำหรับเซสชันนี้",
          "Strong authentication verified for this session",
        )}
      </p>
    );
  async function enrol() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `iCareTele ${new Date().toISOString().slice(0, 16)}`,
      });
      if (error) throw error;
      setFactor(data.id);
      setQr(
        data.totp.qr_code.startsWith("data:")
          ? data.totp.qr_code
          : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to enrol");
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code });
      if (error) throw error;
      // challengeAndVerify updates the active session and its AAL2 claim.
      // Do not await a second refresh here: local GoTrue can keep that
      // request open while the factor session is being finalized.
      setLevel("aal2");
      setQr("");
      setCode("");
      onVerified?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to verify");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="surface space-y-4 p-5">
      <h2 className="font-semibold">
        {c("ยืนยันตัวตนก่อนรายการสำคัญ", "Verify identity for privileged operations")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {c(
          "การยืนยันยอดเงิน เปิดเงื่อนไข และเปลี่ยนสิทธิ์ต้องใช้แอป Authenticator",
          "Settlement verification, terms activation and permission changes require an authenticator.",
        )}
      </p>
      {!factor ? (
        <Button variant="outline" disabled={busy} onClick={() => void enrol()}>
          {c("ตั้งค่า Authenticator", "Set up authenticator")}
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          {qr && (
            <img
              src={qr}
              alt={c(
                "สแกนด้วยแอป Authenticator ของคุณ ห้ามแชร์ QR นี้",
                "Scan with your authenticator. Do not share this QR.",
              )}
              className="size-48"
              width={192}
              height={192}
            />
          )}
          <Label htmlFor="care-mfa-code">{c("รหัส 6 หลัก", "Six-digit code")}</Label>
          <div className="flex flex-wrap gap-3">
            <Input
              id="care-mfa-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="max-w-48"
            />
            <Button disabled={busy} type="submit">
              {c("ยืนยัน", "Verify")}
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
