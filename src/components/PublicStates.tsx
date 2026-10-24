import { useEffect } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";

// Public fallback states. Fixed bilingual copy only: never render error messages, stack traces,
// database names, emails, tokens or private links.
const btn = "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Shell({ th, en, body, children }: { th: string; en: string; body: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground"><span lang="th">{th}</span><span className="block text-lg text-muted-foreground">{en}</span></h1>
        <p className="mt-3 text-sm text-muted-foreground">{body}</p>
        <nav aria-label="Recovery" className="mt-6 flex flex-wrap justify-center gap-2">{children}</nav>
      </div>
    </main>
  );
}
const Links = () => (
  <>
    <Link to="/" className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>กลับหน้าแรก · Home</Link>
    <Link to="/partner-apply" className={`${btn} border border-input text-foreground hover:bg-accent`}>สมัครเป็นพาร์ทเนอร์ · Apply</Link>
    <Link to="/care-demo" className={`${btn} border border-input text-foreground hover:bg-accent`}>ดูเดโม · Demo</Link>
  </>
);
export function PublicNotFound() {
  return <Shell th="ไม่พบหน้านี้" en="Page not found" body="ลิงก์อาจไม่ถูกต้องหรือหน้าถูกย้ายแล้ว · The link may be wrong or the page has moved."><Links /></Shell>;
}
export function PublicError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <Shell th="หน้านี้โหลดไม่สำเร็จ" en="This page didn't load" body="โปรดลองอีกครั้ง · Please try again. No details are shown for your privacy.">
      <button type="button" onClick={() => { router.invalidate(); reset(); }} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>ลองอีกครั้ง · Try again</button>
      <Link to="/" className={`${btn} border border-input text-foreground hover:bg-accent`}>กลับหน้าแรก · Home</Link>
    </Shell>
  );
}
