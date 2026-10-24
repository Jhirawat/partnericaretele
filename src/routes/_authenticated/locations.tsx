import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { listPartners } from "@/lib/partnercare.functions";
import { createLocation, createRoom, listLocations, listRooms, setLocationStatus } from "@/lib/wellness.functions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/locations")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Locations — THAIKANYA PartnerCare" },
      { name: "description", content: "Branches, opening details and treatment rooms across the partner network." },
      { property: "og:title", content: "Locations — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Branches and treatment rooms across the partner network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LocationsPage,
});

function LocationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const partnersFn = useServerFn(listPartners);
  const locationsFn = useServerFn(listLocations);
  const roomsFn = useServerFn(listRooms);
  const createFn = useServerFn(createLocation);
  const statusFn = useServerFn(setLocationStatus);
  const roomFn = useServerFn(createRoom);

  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const [roomOpen, setRoomOpen] = useState(false);
  const [roomLocationId, setRoomLocationId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");

  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => partnersFn({}) });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => locationsFn({}) });
  const { data: rooms } = useQuery({ queryKey: ["rooms"], queryFn: () => roomsFn({ data: {} }) });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["locations"] });
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: { partnerId, code, name, city, address, phone, countryCode: "TH", timezone: "Asia/Bangkok" },
      }),
    onSuccess: () => {
      toast.success(t("locations.created"));
      setOpen(false);
      setCode("");
      setName("");
      setCity("");
      setAddress("");
      setPhone("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: "ACTIVE" | "INACTIVE" }) => statusFn({ data: input }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const roomMutation = useMutation({
    mutationFn: () => roomFn({ data: { locationId: roomLocationId, code: roomCode, name: roomName, capacity: 1 } }),
    onSuccess: () => {
      toast.success(t("locations.roomCreated"));
      setRoomOpen(false);
      setRoomCode("");
      setRoomName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("locations.title")}
        subtitle={t("locations.subtitle")}
        action={
          <div className="flex gap-2">
            <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!locations?.length}>
                  {t("locations.newRoom")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("locations.newRoom")}</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    roomMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label>{t("locations.location")}</Label>
                    <Select value={roomLocationId} onValueChange={setRoomLocationId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("locations.location")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(locations ?? []).map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="roomCode">{t("locations.code")}</Label>
                      <Input id="roomCode" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="roomName">{t("locations.name")}</Label>
                      <Input id="roomName" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={roomMutation.isPending || !roomLocationId}>
                      {t("common.create")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={!partners?.length}>{t("locations.newLocation")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("locations.newLocation")}</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label>{t("locations.organisation")}</Label>
                    <Select value={partnerId} onValueChange={setPartnerId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("locations.organisation")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(partners ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="code">{t("locations.code")}</Label>
                      <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">{t("locations.name")}</Label>
                      <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("locations.city")}</Label>
                      <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t("locations.phone")}</Label>
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">{t("locations.address")}</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending || !partnerId || !code || !name}>
                      {t("common.create")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <section className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("locations.name")}</TableHead>
              <TableHead>{t("locations.organisation")}</TableHead>
              <TableHead>{t("locations.city")}</TableHead>
              <TableHead>{t("locations.rooms")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(locations ?? []).map((l) => {
              const roomCount = (rooms ?? []).filter((r) => r.location_id === l.id).length;
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="font-medium">{l.name}</span>
                    <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                      {l.code}
                    </span>
                  </TableCell>
                  <TableCell>{l.partners?.display_name ?? "—"}</TableCell>
                  <TableCell>{l.city ?? "—"}</TableCell>
                  <TableCell>{roomCount}</TableCell>
                  <TableCell>
                    <StatusBadge value={l.status} />
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        statusMutation.mutate({ id: l.id, status: l.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                      }
                    >
                      {l.status === "ACTIVE" ? t("common.deactivate") : t("common.activate")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!locations?.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      {!!rooms?.length && (
        <section className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("locations.room")}</TableHead>
                <TableHead>{t("locations.location")}</TableHead>
                <TableHead>{t("locations.capacity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.locations?.name ?? "—"}</TableCell>
                  <TableCell>{r.capacity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
