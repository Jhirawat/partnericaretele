import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Clock3, Info, Search } from "lucide-react";

const TONE: Record<string, { classes: string; icon: typeof Info }> = {
  ACTIVE: { classes: "bg-success/12 text-success border-success/25", icon: CheckCircle2 },
  COMPLETED: { classes: "bg-success/12 text-success border-success/25", icon: CheckCircle2 },
  STARTED: { classes: "bg-info/12 text-info border-info/25", icon: Info },
  WAITING: { classes: "bg-warning/15 text-warning-foreground border-warning/35", icon: Clock3 },
  PENDING: { classes: "bg-warning/15 text-warning-foreground border-warning/35", icon: Clock3 },
  CREATED: { classes: "bg-muted text-muted-foreground border-border", icon: Info },
  SCREENING: { classes: "bg-[#eee8ff] text-[#6848ad] border-[#6848ad]/25", icon: Search },
  SUSPENDED: { classes: "bg-destructive/10 text-destructive border-destructive/25", icon: AlertCircle },
  TERMINATED: { classes: "bg-destructive/10 text-destructive border-destructive/25", icon: AlertCircle },
  CANCELLED: { classes: "bg-destructive/10 text-destructive border-destructive/25", icon: AlertCircle },
  FAILED: { classes: "bg-destructive/10 text-destructive border-destructive/25", icon: AlertCircle },
};

export function StatusBadge({ value, prefix = "status" }: { value: string; prefix?: string }) {
  const { t } = useI18n();
  const tone = TONE[value] ?? { classes: "bg-muted text-muted-foreground border-border", icon: Info };
  const Icon = tone.icon;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone.classes,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {t(`${prefix}.${value}`)}
    </span>
  );
}
