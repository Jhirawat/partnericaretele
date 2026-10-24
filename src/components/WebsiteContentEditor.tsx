import { useEffect, useState } from "react";
import { Check, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SITE_CONTENT, safeSiteContent, type SiteContent } from "@/lib/site-content";

const STORAGE_KEY = "icaretele.site-content.draft";
export function WebsiteContentEditor() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [saved, setSaved] = useState(false);
  useEffect(() => { try { setContent(safeSiteContent(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))); } catch { setContent(DEFAULT_SITE_CONTENT); } }, []);
  const patch = (key: keyof SiteContent, value: string) => { setSaved(false); setContent(previous => ({ ...previous, [key]: value })); };
  const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(content)); setSaved(true); };
  const reset = () => { localStorage.removeItem(STORAGE_KEY); setContent(DEFAULT_SITE_CONTENT); setSaved(false); };
  return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold">Website Content</h2><p className="mt-1 text-sm text-muted-foreground">Manage public copy in a safe structured draft. Rich text and scripts are intentionally excluded.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Field label="Hero heading" value={content.heroTitle} onChange={v => patch("heroTitle", v)} />
      <Field label="Footer text" value={content.footer} onChange={v => patch("footer", v)} />
      <TextField label="Hero body" value={content.heroBody} onChange={v => patch("heroBody", v)} />
      <TextField label="About" value={content.about} onChange={v => patch("about", v)} />
      <TextField label="Services" value={content.services} onChange={v => patch("services", v)} />
      <TextField label="FAQ" value={content.faq} onChange={v => patch("faq", v)} />
    </div>
    <div className="flex flex-wrap items-center gap-3"><Button onClick={save}><Save className="size-4" />Save draft</Button><Button variant="outline" onClick={reset}><RotateCcw className="size-4" />Reset draft</Button>{saved && <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4" />Draft saved on this device</span>}</div>
  </div>;
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input maxLength={300} value={value} onChange={e => onChange(e.target.value)} /></div>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><Textarea maxLength={2000} rows={5} value={value} onChange={e => onChange(e.target.value)} /></div>; }
