export const SUPER_PATHS = new Set(["/site-settings", "/superadmin-console", "/privacy-health", "/credit-health", "/sla-health", "/system-health", "/integrations"]);
export const STAFF_PATHS = new Set(["/dashboard", "/admin-console"]);
export function privilegedScope(path: string): "super" | "staff" | null {
  return SUPER_PATHS.has(path) ? "super" : STAFF_PATHS.has(path) ? "staff" : null;
}
export function staffRoleAllowed(scope: "super" | "staff", roles: { role: string; status: string; partnerId: string | null }[]): boolean {
  return roles.some(r => r.status === "ACTIVE" && (scope === "super" ? r.role === "SUPER_ADMIN" && r.partnerId === null : r.role === "OPERATIONS_ADMIN" || (r.partnerId === null && ["SUPER_ADMIN", "FINANCE_ADMIN", "COMPLIANCE_AUDITOR"].includes(r.role))));
}