import { useI18n } from "@/i18n";

export type CaseSummary = {
  chiefComplaint: string;
  history: string;
  assessment: string;
  recommendedActions: string[];
  followUp: string;
  riskFlags: string[];
};

export function isCaseSummary(value: unknown): value is CaseSummary {
  return !!value && typeof value === "object" && "chiefComplaint" in (value as Record<string, unknown>);
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export function CaseSummaryView({ summary }: { summary: CaseSummary }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <Section label={t("summary.chiefComplaint")}>{summary.chiefComplaint || "—"}</Section>
      <Section label={t("summary.history")}>{summary.history || "—"}</Section>
      <Section label={t("summary.assessment")}>{summary.assessment || "—"}</Section>
      <Section label={t("summary.actions")}>
        {summary.recommendedActions?.length ? (
          <ul className="list-disc space-y-1 ps-5">
            {summary.recommendedActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </Section>
      <Section label={t("summary.followUp")}>{summary.followUp || "—"}</Section>
      {summary.riskFlags?.length ? (
        <Section label={t("summary.risks")}>
          <ul className="list-disc space-y-1 ps-5 text-destructive">
            {summary.riskFlags.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
