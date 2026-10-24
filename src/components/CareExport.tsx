import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { Button } from "./ui/button";
export function CareExport({ read }: { read: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const { locale } = useI18n();
  async function download() {
    setBusy(true);
    try {
      const report = await read();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `icaretele-reconciliation-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button className="mt-5 ml-3" variant="outline" disabled={busy} onClick={() => void download()}>
      {locale === "th" ? "ส่งออกรายงานกระทบยอด" : "Export reconciliation"}
    </Button>
  );
}
