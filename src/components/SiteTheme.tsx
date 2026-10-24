import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/i18n";
import { readSiteSettings } from "@/lib/site-settings.functions";
import { safeSiteName, safeTheme, themeTokens, type Surface, type ThemeConfig } from "@/lib/site-settings";
import { motionClass, motionStyle } from "@/lib/motion";

const ThemeContext = createContext<{ name: string; theme: ThemeConfig | null }>({ name: "", theme: null });
export const useSiteTheme = () => useContext(ThemeContext);
export function ThemeFrame({ theme, children, className = "" }: { theme: ThemeConfig; children: ReactNode; className?: string }) {
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => { const m = window.matchMedia("(prefers-color-scheme: dark)"); const update = () => setSystemDark(m.matches); update(); m.addEventListener("change", update); return () => m.removeEventListener("change", update); }, []);
  return <div className={`site-theme ${motionClass("page")} ${className}`} data-card={theme.card} style={{ ...themeTokens(theme, systemDark), ...motionStyle() } as CSSProperties}>{children}</div>;
}

export function MotionSection({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={`${motionClass("section")} ${className}`} style={motionStyle(delay)}>{children}</div>;
}
export function SiteTheme({ scope, allowed, children }: { scope: Surface | null; allowed: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const read = useServerFn(readSiteSettings);
  const { data } = useQuery({ queryKey: ["site-settings", scope], queryFn: () => read({ data: { scope: scope ?? "admin" } }), enabled: !!scope && allowed, staleTime: 30_000, refetchInterval: 60_000 });
  const name = safeSiteName(data?.settings["site_name"]?.value, t("brand.name"));
  const theme = scope && allowed ? safeTheme(data?.settings[`theme_${scope}`]?.value) : null;
  useEffect(() => {
    if (!scope || !allowed) return;
    const oldTitle = document.title;
    const elements = Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[property="og:title"]'));
    const previous = elements.map(el => el.content);
    document.title = `${scope === "customer" ? "Customer Portal" : scope === "doctor" ? "Doctor Portal" : "Admin Dashboard"} — ${name}`;
    elements.forEach(el => { el.content = document.title; });
    return () => { document.title = oldTitle; elements.forEach((el, i) => { el.content = previous[i] ?? oldTitle; }); };
  }, [scope, allowed, name]);
  const content = <ThemeContext.Provider value={{ name, theme }}>{children}</ThemeContext.Provider>;
  return theme ? <ThemeFrame theme={theme}>{content}</ThemeFrame> : content;
}
