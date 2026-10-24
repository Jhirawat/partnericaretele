import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SYNTHETIC_NOTICE } from "@/lib/console-mock";
import { cn } from "@/lib/utils";

const SHELLS = [
  { to: "/preview/admin", label: "Admin Console" },
  { to: "/preview/superadmin", label: "Superadmin Console" },
  { to: "/preview/doctor", label: "Doctor Workspace" },
  { to: "/preview/partner", label: "Partner Workspace" },
  { to: "/preview/mcs", label: "MCS Handoff Queue" },
] as const;

/**
 * Shared shell for the UI-only Master Workflow preview screens.
 * Role switching here is mock navigation only — it never touches real roles,
 * memberships, auth, or organization guards.
 */
export function PreviewShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-warning/40 bg-warning/15 px-5 py-2 text-center text-sm font-medium text-warning-foreground">
        {SYNTHETIC_NOTICE}
      </div>
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <nav aria-label="Preview role shells" className="flex flex-wrap gap-1">
          {SHELLS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className={cn("rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent")}
              activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-5 pb-12">{children}</main>
    </div>
  );
}

export function MockCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("surface p-5", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function MockBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {value.replaceAll("_", " ")}
    </span>
  );
}
