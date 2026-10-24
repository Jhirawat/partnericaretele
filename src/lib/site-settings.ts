import { z } from "zod";

export const PALETTES = { blue: "#2563eb", purple: "#7c3aed", green: "#15803d", orange: "#c2410c" } as const;
export const themeSchema = z.object({
  mode: z.enum(["light", "dark", "system"]),
  primary: z.string().regex(/^#[\da-fA-F]{6}$/).transform(v => v.toLowerCase()),
  font: z.enum(["system", "manrope", "sora"]),
  scale: z.number().min(0.9).max(1.2),
  weight: z.union([z.literal(400), z.literal(600), z.literal(700)]),
  radius: z.enum(["square", "subtle", "rounded"]),
  card: z.enum(["standard", "glass"]),
  navigation: z.enum(["sidebar", "topbar"]),
  collapsed: z.boolean(),
}).strict();
export type ThemeConfig = z.infer<typeof themeSchema>;
export type Surface = "admin" | "doctor" | "customer";
export const siteNameSchema = z.string().trim().max(80).refine(v => !/[\u0000-\u001f\u007f<>/@\\:=]|www\.|https?\.|\.(?:com|net|org)\b|password|secret|token|credential|\d{7}/i.test(v), "Use a site name, not a link or sensitive information.");
export const settingSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("site_name"), value: siteNameSchema, expected: z.number().int().min(0) }).strict(),
  z.object({ key: z.enum(["theme_admin", "theme_doctor", "theme_customer"]), value: themeSchema, expected: z.number().int().min(0) }).strict(),
]);
export const DEFAULT_THEME: ThemeConfig = { mode: "light", primary: "#195441", font: "manrope", scale: 1, weight: 400, radius: "rounded", card: "standard", navigation: "sidebar", collapsed: false };
export function safeTheme(value: unknown): ThemeConfig { const parsed = themeSchema.safeParse(value); return parsed.success ? parsed.data : { ...DEFAULT_THEME }; }
export function safeSiteName(value: unknown, fallback: string): string { const parsed = siteNameSchema.safeParse(value); return parsed.success && parsed.data ? parsed.data : fallback; }
export function surfaceForPath(path: string): Surface | null {
  if (["/dashboard", "/admin-console", "/superadmin-console", "/site-settings"].includes(path)) return "admin";
  if (["/doctor", "/doctor-workspace"].includes(path)) return "doctor";
  if (["/portal", "/care-patient"].includes(path)) return "customer";
  return null;
}
export function canReadSurface(scope: Surface | null, roles: { role: string; status: string; partnerId: string | null }[]): boolean {
  if (!scope) return false;
  return roles.some(r => r.status === "ACTIVE" && ((r.role === "SUPER_ADMIN" && r.partnerId === null) || (scope === "customer" ? ["PATIENT", "CUSTOMER"].includes(r.role) : scope === "doctor" ? r.role === "DOCTOR" : ["OPERATIONS_ADMIN", "FINANCE_ADMIN", "COMPLIANCE_AUDITOR", "LOCATION_MANAGER"].includes(r.role))));
}
export function luminance(hex: string): number {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error("Invalid HEX");
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (rgb[0] ?? 0) + 0.7152 * (rgb[1] ?? 0) + 0.0722 * (rgb[2] ?? 0);
}
export function contrast(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// Controlled semantic token generation, never arbitrary CSS from saved input.
export function themeTokens(value: unknown, systemDark = false): Record<string, string> {
  const t = safeTheme(value), dark = t.mode === "dark" || (t.mode === "system" && systemDark);
  const foreground = contrast(t.primary, "#ffffff") >= 4.5 ? "#ffffff" : "#000000";
  const bg = dark ? "#14191c" : "#f5f7f8", card = dark ? "#20282d" : "#ffffff", text = dark ? "#f4f7f8" : "#172126";
  // Accent text is separately chosen for canvas contrast; bright custom colours stay on buttons only.
  const link = contrast(t.primary, card) >= 4.5 ? t.primary : text;
  return {
    "--background": bg, "--foreground": text, "--card": card, "--card-foreground": text,
    "--popover": card, "--popover-foreground": text, "--primary": t.primary, "--primary-foreground": foreground,
    "--muted": dark ? "#2c363c" : "#eaf0f2", "--muted-foreground": dark ? "#b7c6ce" : "#4f626d",
    "--secondary": dark ? "#2c363c" : "#eaf0f2", "--secondary-foreground": text,
    "--accent": dark ? "#33444c" : "#dde8ec", "--accent-foreground": text,
    "--border": dark ? "#647781" : "#82949d", "--input": dark ? "#647781" : "#82949d", "--ring": link,
    "--sidebar": dark ? "#20282d" : "#172c34", "--sidebar-foreground": "#f4f7f8",
    "--sidebar-accent": "#344f5b", "--sidebar-accent-foreground": "#ffffff", "--sidebar-border": "#647781",
    "--font-sans": { system: "ui-sans-serif, system-ui, sans-serif", manrope: '"Manrope", ui-sans-serif, sans-serif', sora: '"Sora", ui-sans-serif, sans-serif' }[t.font],
    "--font-display": { system: "ui-sans-serif, system-ui, sans-serif", manrope: '"Manrope", ui-sans-serif, sans-serif', sora: '"Sora", ui-sans-serif, sans-serif' }[t.font],
    "--theme-scale": String(t.scale), "--theme-weight": String(t.weight),
    "--radius": { square: "0rem", subtle: "0.25rem", rounded: "0.5rem" }[t.radius],
    "--theme-card-background": t.card === "glass" ? (dark ? "#20282df2" : "#fffffff2") : card,
    "--theme-link": link,
  };
}
export const settingsResultSchema = z.object({
  settings: z.record(z.string(), z.object({ value: z.union([siteNameSchema, themeSchema]), revision: z.number().int() })),
  history: z.array(z.object({ setting_key: z.string(), revision: z.number().int(), value: z.union([siteNameSchema, themeSchema]), created_at: z.string() })),
});