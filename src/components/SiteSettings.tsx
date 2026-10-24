import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Save, Check, PanelLeft, LayoutDashboard, Stethoscope, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ThemeFrame } from "./SiteTheme";
import { BrandIdentity } from "./BrandIdentity";
import { readSiteSettings, saveSiteSetting } from "@/lib/site-settings.functions";
import { getMyAccess } from "@/lib/partnercare.functions";
import { DEFAULT_THEME, PALETTES, safeSiteName, safeTheme, settingSchema, type ThemeConfig, type Surface, type settingsResultSchema } from "@/lib/site-settings";
import type { z } from "zod";
import { useI18n } from "@/i18n";
import { WebsiteContentEditor } from "./WebsiteContentEditor";

type SettingsData = z.infer<typeof settingsResultSchema>;
export function SiteSettings() {
  const accessFn = useServerFn(getMyAccess);
  const read = useServerFn(readSiteSettings);
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: () => accessFn({}) });
  const allowed = access?.roles.some(r => r.role === "SUPER_ADMIN" && r.status === "ACTIVE" && r.partnerId === null) ?? false;
  const result = useQuery({ queryKey: ["site-settings", "manage"], queryFn: () => read({ data: { scope: "manage" } }), enabled: allowed });
  if (!access) return <p role="status">Checking access…</p>;
  if (!allowed) return <section><h1 className="text-2xl font-semibold">Site Settings</h1><p className="mt-4 text-muted-foreground">Superadmin access is required.</p></section>;
  if (result.isError) return <p role="alert">Site settings are unavailable. <Button variant="outline" onClick={() => result.refetch()}>Retry</Button></p>;
  if (!result.data) return <p role="status">Loading settings…</p>;
  return <SettingsEditor data={result.data} />;
}
function SettingsEditor({ data }: { data: SettingsData }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const save = useServerFn(saveSiteSetting);
  const [name, setName] = useState(safeSiteName(data.settings["site_name"]?.value, ""));
  const [themes, setThemes] = useState({ admin: safeTheme(data.settings["theme_admin"]?.value), doctor: safeTheme(data.settings["theme_doctor"]?.value), customer: safeTheme(data.settings["theme_customer"]?.value) });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (input: unknown) => save({ data: settingSchema.parse(input) }),
    onSuccess: async (_, input) => { const saved = settingSchema.parse(input); if (saved.key === "site_name") setName(saved.value); else setThemes(previous => ({ ...previous, [saved.key === "theme_admin" ? "admin" : saved.key === "theme_doctor" ? "doctor" : "customer"]: saved.value })); setError(""); setNotice("Saved and applied."); await qc.invalidateQueries({ queryKey: ["site-settings"] }); },
    onError: (e: Error) => { setNotice(""); setError(e.message); },
  });
  const submit = (key: "site_name" | "theme_admin" | "theme_doctor" | "theme_customer", value: unknown) => { setError(""); setNotice(""); mutation.mutate({ key, value, expected: data.settings[key]?.revision ?? 0 }); };
  const brand = safeSiteName(name, t("brand.name"));
  const nameDirty = name !== safeSiteName(data.settings["site_name"]?.value, "");
  return <div className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Site Settings</h1><p className="mt-1 text-sm text-muted-foreground">Branding and workspace appearance</p></div><span className="text-sm text-muted-foreground">Superadmin</span></header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="flex items-center gap-2 text-sm"><Check className="size-4" />{notice}</p>}
    <Tabs defaultValue="branding">
      <TabsList className="mb-6"><TabsTrigger value="branding">Branding</TabsTrigger><TabsTrigger value="content">Website Content</TabsTrigger><TabsTrigger value="themes">Theme Settings</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
      <TabsContent value="branding" className="space-y-6">
        <div className="max-w-xl space-y-3"><Label htmlFor="site-name">Website Name / Site Name</Label><Input id="site-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t("brand.name")} /><div className="flex flex-wrap items-center gap-3"><Button onClick={() => submit("site_name", name)} disabled={!nameDirty || mutation.isPending}><Save className="size-4" />{mutation.isPending ? "Saving…" : "Save name"}</Button><Button variant="outline" onClick={() => setName(safeSiteName(data.settings["site_name"]?.value, ""))} disabled={!nameDirty || mutation.isPending}><RotateCcw className="size-4" />Discard changes</Button>{nameDirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}</div></div>
        <div className="border-t pt-6"><BrandIdentity /><p className="mt-4 text-sm text-muted-foreground">Existing logo and favicon are unchanged.</p></div>
      </TabsContent>
      <TabsContent value="content"><WebsiteContentEditor /></TabsContent>
      <TabsContent value="themes" className="space-y-8">
        {(["admin", "doctor", "customer"] as const).map(scope => {
          const theme = themes[scope], key = `theme_${scope}` as const;
          const dirty = JSON.stringify(theme) !== JSON.stringify(safeTheme(data.settings[key]?.value));
          const patch = (value: Partial<ThemeConfig>) => setThemes(previous => ({ ...previous, [scope]: { ...previous[scope], ...value } }));
          return <section key={scope} className="space-y-5 border-t pt-6 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{scope === "customer" ? "Customer Portal / Customer App" : scope === "admin" ? "Admin Dashboard" : "Doctor Portal"}</h2><span className="text-xs text-muted-foreground">Version {data.settings[key]?.revision ?? 0}{dirty ? " · Unsaved changes" : " · Saved"}</span></div>
            <div className="grid gap-6 xl:grid-cols-2"><div className="grid content-start gap-4 sm:grid-cols-2">
              <Choice label="Color mode" value={theme.mode} values={["light", "dark", "system"]} onChange={v => patch({ mode: v as ThemeConfig["mode"] })} />
              <Choice label="Font family" value={theme.font} values={["system", "manrope", "sora"]} onChange={v => patch({ font: v as ThemeConfig["font"] })} />
              <div className="space-y-2 sm:col-span-2"><Label>Primary palette</Label><div className="flex flex-wrap items-center gap-2">{Object.entries(PALETTES).map(([label, hex]) => <Button key={label} size="icon" variant={theme.primary === hex ? "default" : "outline"} title={label} aria-label={`${scope} ${label} palette`} onClick={() => patch({ primary: hex })}><span className={`theme-swatch palette-${label}`} />{theme.primary === hex && <Check className="absolute size-3" />}</Button>)}<Input className="w-32" aria-label={`${scope} Custom HEX`} maxLength={7} value={theme.primary} onChange={e => patch({ primary: e.target.value })} /></div></div>
              <div className="space-y-2"><Label htmlFor={`${scope}-scale`}>Font scale</Label><Input id={`${scope}-scale`} type="number" min={0.9} max={1.2} step={0.05} value={theme.scale} onChange={e => patch({ scale: Number(e.target.value) })} /></div>
              <Choice label="Font weight" value={String(theme.weight)} values={["400", "600", "700"]} onChange={v => patch({ weight: Number(v) as ThemeConfig["weight"] })} />
              <Choice label="Border radius" value={theme.radius} values={["square", "subtle", "rounded"]} onChange={v => patch({ radius: v as ThemeConfig["radius"] })} />
              <Choice label="Card style" value={theme.card} values={["standard", "glass"]} onChange={v => patch({ card: v as ThemeConfig["card"] })} />
              <Choice label="Navigation" value={theme.navigation} values={["sidebar", "topbar"]} onChange={v => patch({ navigation: v as ThemeConfig["navigation"] })} />
              <div className="flex items-center gap-3"><Switch id={`${scope}-collapse`} checked={theme.collapsed} onCheckedChange={v => patch({ collapsed: v })} /><Label htmlFor={`${scope}-collapse`}>Collapsed by default</Label></div>
            </div><WorkspacePreview scope={scope} theme={theme} brand={brand} /></div>
            <div className="flex flex-wrap gap-3"><Button onClick={() => submit(key, theme)} disabled={!dirty || mutation.isPending}><Save className="size-4" />{mutation.isPending ? "Saving…" : "Save / Apply"}</Button><Button variant="outline" onClick={() => setThemes(previous => ({ ...previous, [scope]: { ...DEFAULT_THEME } }))} disabled={mutation.isPending}><RotateCcw className="size-4" />Reset to defaults</Button><Button variant="ghost" onClick={() => setThemes(previous => ({ ...previous, [scope]: safeTheme(data.settings[key]?.value) }))} disabled={!dirty || mutation.isPending}>Discard changes</Button></div>
          </section>;
        })}
      </TabsContent>
      <TabsContent value="history"><h2 className="mb-4 text-lg font-semibold">Saved versions</h2><div className="divide-y border-y">{data.history.map(row => <div key={`${row.setting_key}:${row.revision}`} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold">{row.setting_key === "site_name" ? "Website Name" : row.setting_key === "theme_customer" ? "Customer Portal" : row.setting_key === "theme_admin" ? "Admin Dashboard" : "Doctor Portal"} · Version {row.revision}</p><time className="text-xs text-muted-foreground">{row.created_at}</time></div><Button variant="outline" disabled={mutation.isPending || data.settings[row.setting_key]?.revision === row.revision} onClick={() => submit(row.setting_key as "site_name" | "theme_admin" | "theme_doctor" | "theme_customer", row.value)}><RotateCcw className="size-4" />Restore as new version</Button></div>)}{!data.history.length && <p className="py-6 text-sm text-muted-foreground">No saved changes yet.</p>}</div></TabsContent>
    </Tabs>
  </div>;
}
function Choice({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full capitalize"><SelectValue /></SelectTrigger><SelectContent>{values.map(v => <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>)}</SelectContent></Select></div>;
}
export function WorkspacePreview({ scope, theme, brand }: { scope: Surface; theme: ThemeConfig; brand: string }) {
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  useEffect(() => { setCollapsed(null); }, [theme.collapsed]);
  const [tab, setTab] = useState("Overview");
  const compact = collapsed ?? theme.collapsed;
  const Icon = scope === "customer" ? HeartPulse : scope === "admin" ? LayoutDashboard : Stethoscope;
  return <ThemeFrame theme={safeTheme(theme)} className="workspace-preview overflow-hidden border border-border bg-background text-foreground">
    <div className={`flex min-h-80 ${theme.navigation === "topbar" ? "flex-col" : "flex-row"}`}><nav aria-label={`${scope} preview navigation`} className={`shrink-0 bg-sidebar text-sidebar-foreground ${theme.navigation === "topbar" ? "flex flex-wrap items-center gap-2 p-3" : compact ? "w-14 p-2" : "w-32 p-3"}`}><Button variant="ghost" size="icon" title="Toggle navigation" aria-label={`${scope} Toggle navigation`} onClick={() => setCollapsed(!compact)}><PanelLeft className="size-4" /></Button>{["Overview", scope === "customer" ? "My care" : "Queue"].map(v => <Button key={v} variant="ghost" size="sm" title={v} aria-label={compact ? v : undefined} onClick={() => setTab(v)} className="flex max-w-full gap-1"><Icon className="size-4 shrink-0" />{!compact && v}</Button>)}</nav><div className="min-w-0 flex-1"><header className="border-b bg-card p-3 font-display text-sm font-semibold break-words">{brand}</header><div className="space-y-4 p-4"><h3 className="text-base font-semibold">{tab}</h3><article className="surface p-4"><p className="text-sm text-muted-foreground">{scope === "customer" ? "Appointments" : scope === "admin" ? "Operations" : "Consultations"}</p><p className="mt-2 text-2xl font-semibold">0</p><span className="text-xs text-muted-foreground">Preview</span></article>{scope === "customer" ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); setTab("My care"); }}><Label htmlFor="customer-preview-service">Service</Label><Input id="customer-preview-service" aria-label="customer preview service" placeholder="Service" /><Button size="sm" type="submit">Find appointment</Button></form> : <><Input aria-label={`${scope} preview search`} placeholder="Search" /><Button size="sm" onClick={() => setTab(tab === "Queue" ? "Overview" : "Queue")}>{tab === "Queue" ? "Overview" : "View queue"}</Button></>}</div></div></div>
  </ThemeFrame>;
}
