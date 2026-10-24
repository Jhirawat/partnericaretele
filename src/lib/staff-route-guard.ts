import { redirect } from "@tanstack/react-router";
import { checkStaffAccess } from "./staff-access.functions";

export async function requireStaffRoute(scope: "super" | "staff") {
  const state = await checkStaffAccess({ data: { scope } });
  if (state !== "ALLOWED") throw redirect({ to: "/admin-auth", replace: true });
}