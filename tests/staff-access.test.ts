import { describe, it, expect } from "bun:test";
import { privilegedScope, staffRoleAllowed } from "../src/lib/staff-access";
describe("Staff authorization without client privilege claims", () => {
  const grant = (role: string, partnerId: string | null = null, status = "ACTIVE") => [{ role, partnerId, status }];
  it("only active global Superadmin grants Superadmin access", () => {
    expect(staffRoleAllowed("super", grant("SUPER_ADMIN"))).toBe(true);
    for (const role of ["CUSTOMER", "PATIENT", "DOCTOR", "OPERATIONS_ADMIN", "PARTNER_OWNER", "FINANCE_ADMIN"]) expect(staffRoleAllowed("super", grant(role))).toBe(false);
    expect(staffRoleAllowed("super", grant("SUPER_ADMIN", "tenant"))).toBe(false);
    expect(staffRoleAllowed("super", grant("SUPER_ADMIN", null, "SUSPENDED"))).toBe(false);
  });
  it("keeps scoped Operations operational access without Superadmin controls", () => {
    expect(staffRoleAllowed("staff", grant("OPERATIONS_ADMIN", "tenant"))).toBe(true);
    for (const role of ["CUSTOMER", "DOCTOR", "PATIENT", "PARTNER_OWNER"]) expect(staffRoleAllowed("staff", grant(role))).toBe(false);
  });
  it("privileged paths stay separate from customer doctor and public flows", () => {
    for (const p of ["/site-settings", "/superadmin-console", "/integrations", "/credit-health", "/privacy-health", "/sla-health", "/system-health"]) expect(privilegedScope(p)).toBe("super");
    expect(privilegedScope("/admin-console")).toBe("staff");
    for (const p of ["/", "/auth", "/care-demo", "/portal", "/care-patient", "/doctor", "/doctor-workspace"]) expect(privilegedScope(p)).toBe(null);
  });
});