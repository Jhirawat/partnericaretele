import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readCareHistory } from "@/lib/care.functions";
import { useI18n, useCopy } from "@/i18n";
import { bangkokDate } from "@/lib/service-credit-policy";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
export function CareHistory({ patientId, demo = false }: { patientId: string; demo?: boolean }) {
  const { locale, t } = useI18n();
  const { c, tr } = useCopy();
  const read = useServerFn(readCareHistory);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const q = useQuery({
    queryKey: ["care-history", patientId, page, query],
    enabled: open,
    queryFn: () =>
      demo
        ? Promise.resolve([
            {
              id: "DEMO",
              reference: "DEMO — synthetic history",
              status: "COMPLETED",
              scheduled_at: null,
              completed_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
          ])
        : read({ data: { patientId, page, query } }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {c("ดูประวัติ", "Encounter history")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {c("ประวัติบริการที่ได้รับอนุญาต", "Authorised encounter history")}
          </DialogTitle>
        </DialogHeader>
        <Label htmlFor={`history-${patientId}`}>{c("ค้นหาเลขอ้างอิง", "Search reference")}</Label>
        <Input
          id={`history-${patientId}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        {q.isPending ? (
          <p role="status">{tr("Loading…")}</p>
        ) : q.error ? (
          <p role="alert">{q.error.message}</p>
        ) : (
          q.data.map((e) => (
            <article key={e.id} className="rounded-lg border border-border p-4 text-sm">
              <p className="font-semibold">{e.reference}</p>
              <p className="mt-2">
                {t(`status.${e.status}`)} · {bangkokDate(e.completed_at ?? e.scheduled_at ?? e.created_at, locale)}
              </p>
            </article>
          ))
        )}
        <div className="flex justify-between gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {c("ก่อนหน้า", "Previous")}
          </Button>
          <span>{page + 1}</span>
          <Button
            variant="outline"
            disabled={(q.data?.length ?? 0) < 25}
            onClick={() => setPage(page + 1)}
          >
            {c("ถัดไป", "Next")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
