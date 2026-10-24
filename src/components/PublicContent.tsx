import { Link } from "@tanstack/react-router";
import { useCopy } from "@/i18n";
import { PUBLIC_PAGES, type PublicPage } from "@/lib/public-content";

export function Breadcrumbs({ path }: { path: PublicPage["path"] }) {
  const { c } = useCopy();
  if (path === "/") return null;
  const p = PUBLIC_PAGES[path];
  return (
    <nav aria-label={c("เส้นทางหน้า", "Breadcrumb")} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        <li><Link to="/" className="inline-flex min-h-6 items-center underline-offset-4 hover:underline">iCareTele</Link></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-foreground">{c(p.intent.th, p.intent.en)}</li>
      </ol>
    </nav>
  );
}

export function PublicFaq({ path }: { path: PublicPage["path"] }) {
  const { c } = useCopy();
  const p = PUBLIC_PAGES[path];
  if (!p.faq.length) return null;
  return (
    <section aria-labelledby="faq-title" className="my-14">
      <h2 id="faq-title" className="font-display text-2xl font-semibold">{c("คำถามที่พบบ่อย", "Frequently asked questions")}</h2>
      <dl className="mt-6 space-y-5">
        {p.faq.map((f) => (
          <div key={f.q.en} className="rounded-xl border border-border p-5">
            <dt className="font-semibold">{c(f.q.th, f.q.en)}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{c(f.a.th, f.a.en)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RelatedLinks({ path }: { path: PublicPage["path"] }) {
  const { c } = useCopy();
  return (
    <nav aria-label={c("หน้าที่เกี่ยวข้อง", "Related pages")} className="my-10">
      <ul className="flex flex-wrap gap-3">
        {PUBLIC_PAGES[path].related.map((r) => (
          <li key={r.to}>
            <Link to={r.to} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              {c(r.label.th, r.label.en)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
