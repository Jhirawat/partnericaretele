import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  ACTIVE: "bg-success/12 text-success border-success/25",
  COMPLETED: "bg-success/12 text-success border-success/25",
  STARTED: "bg-info/12 text-info border-info/25",
  WAITING: "bg-warning/15 text-warning-foreground border-warning/35",
  PENDING: "bg-warning/15 text-warning-foreground border-warning/35",
  CREATED: "bg-muted text-muted-foreground border-border",
  SUSPENDED: "bg-destructive/10 text-destructive border-destructive/25",
  TERMINATED: "bg-destructive/10 text-destructive border-destructive/25",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/25",
  FAILED: "bg-destructive/10 text-destructive border-destructive/25",
};

export function StatusBadge({ value, prefix = "status" }: { value: string; prefix?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[value] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {t(`${prefix}.${value}`)}
    </span>
  );
}
