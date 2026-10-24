import { describe, it, expect } from "bun:test";
import { DEFAULT_THEME, PALETTES, safeSiteName, safeTheme, siteNameSchema, themeSchema, themeTokens, surfaceForPath, canReadSurface, contrast, settingSchema } from "../src/lib/site-settings";
describe("Site settings validation and isolated runtime", () => {
  it("trims site names and uses the existing fallback for empty or unavailable values", () => {
    expect(safeSiteName("  Synthetic Clinic  ", "Original")).toBe("Synthetic Clinic");
    for (const value of ["", "  ", null, undefined, {}, "https://example.invalid"]) expect(safeSiteName(value, "Original")).toBe("Original");
  });
  it("rejects links, code, secrets and excessive name length", () => {
    for (const value of ["<script>", "person@example.invalid", "https://example.invalid", "secret", "123456789", "x".repeat(81)]) expect(siteNameSchema.safeParse(value).success).toBe(false);
  });
  it("allows only bounded structured theme values", () => {
    for (const patch of [{ primary: "red" }, { primary: "#123" }, { font: "https://font.invalid" }, { scale: 1.21 }, { scale: 0.89 }, { weight: 900 }, { mode: "automatic" }, { radius: "huge" }, { card: "html" }, { navigation: "script" }, { collapsed: "false" }, { css: "body {}" }]) expect(themeSchema.safeParse({ ...DEFAULT_THEME, ...patch }).success).toBe(false);
  });
  it("has safe defaults with no shared mutable fallback", () => {
    expect(safeTheme(null)).toEqual(DEFAULT_THEME);
    const first = safeTheme(undefined); first.primary = "#000000";
    expect(safeTheme(undefined).primary).toBe("#195441");
  });
  it("all three surfaces remain isolated from public and shared staff paths", () => {
    for (const path of ["/dashboard", "/admin-console", "/superadmin-console", "/site-settings"]) expect(surfaceForPath(path)).toBe("admin");
    for (const path of ["/doctor", "/doctor-workspace"]) expect(surfaceForPath(path)).toBe("doctor");
    for (const path of ["/", "/partner-apply", "/care-demo", "/care", "/requests", "/partner-workspace", "/doctor-recruitment"]) expect(surfaceForPath(path)).toBeNull();
  });
  it("customer routes and role reads remain isolated", () => {
    for (const path of ["/portal", "/care-patient"]) expect(surfaceForPath(path)).toBe("customer");
    for (const role of ["PATIENT", "CUSTOMER"]) {
      const roles = [{ role, status: "ACTIVE", partnerId: null }];
      expect(canReadSurface("customer", roles)).toBe(true);
      expect(canReadSurface("admin", roles)).toBe(false);
      expect(canReadSurface("doctor", roles)).toBe(false);
      expect(canReadSurface(null, roles)).toBe(false);
      expect(canReadSurface("customer", [{ role, status: "SUSPENDED", partnerId: null }])).toBe(false);
    }
    for (const role of ["DOCTOR", "OPERATIONS_ADMIN", "PARTNER_OWNER"]) expect(canReadSurface("customer", [{ role, status: "ACTIVE", partnerId: null }])).toBe(false);
    expect(canReadSurface("customer", [{ role: "SUPER_ADMIN", status: "ACTIVE", partnerId: "synthetic" }])).toBe(false);
  });
  it("customer settings use validated tokens and fallback without changing other themes", () => {
    const customer = { ...DEFAULT_THEME, primary: "#7c3aed", mode: "dark" as const };
    expect(settingSchema.parse({ key: "theme_customer", value: customer, expected: 0 }).value).toEqual(customer);
    expect(themeTokens(customer)["--primary"]).toBe("#7c3aed");
    expect(themeTokens(DEFAULT_THEME)["--primary"]).toBe("#195441");
    expect(safeTheme({ ...customer, font: "https://invalid.test" })).toEqual(DEFAULT_THEME);
    for (const patch of [{ primary: "url(invalid)" }, { css: "body{}" }, { scale: 8 }, { weight: 900 }]) expect(settingSchema.safeParse({ key: "theme_customer", value: { ...customer, ...patch }, expected: 0 }).success).toBe(false);
  });
  it("produces accessible contrast for every palette and extreme HEX values", () => {
    for (const primary of [...Object.values(PALETTES), "#ffffff", "#000000", "#808080", "#ffff00"]) for (const mode of ["light", "dark", "system"] as const) {
      const tokens = themeTokens({ ...DEFAULT_THEME, primary, mode }, true);
      expect(contrast(tokens["--primary"] ?? "", tokens["--primary-foreground"] ?? "")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens["--theme-link"] ?? "", tokens["--card"] ?? "")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens["--foreground"] ?? "", tokens["--background"] ?? "")).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("applies system dark mode and runtime font, scale, radius, card tokens", () => {
    const t = { ...DEFAULT_THEME, mode: "system" as const, font: "system" as const, scale: 1.2, weight: 600 as const, radius: "square" as const, card: "glass" as const };
    expect(themeTokens(t, false)["--background"]).not.toBe(themeTokens(t, true)["--background"]);
    expect(themeTokens(t)["--theme-scale"]).toBe("1.2");
    expect(themeTokens(t)["--theme-weight"]).toBe("600");
    expect(themeTokens(t)["--radius"]).toBe("0rem");
    expect(themeTokens(t)["--font-sans"]).toContain("system-ui");
  });
  it("requires expected version and disallows extra command fields", () => {
    expect(settingSchema.safeParse({ key: "site_name", value: "Synthetic", expected: 0 }).success).toBe(true);
    for (const patch of [{ expected: -1 }, { expected: 0.1 }, { key: "favicon" }, { css: "script" }]) expect(settingSchema.safeParse({ key: "site_name", value: "Synthetic", expected: 0, ...patch }).success).toBe(false);
  });
});