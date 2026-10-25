import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Building2,
  Users,
  Stethoscope,
  ScrollText,
  LogOut,
  Coins,
  PlugZap,
  HeartPulse,
  MapPin,
  Sparkles,
  Hand,
  CalendarDays,
  Wallet,
  ClipboardPlus,
  ShoppingBag,
  Bell,
  ShieldCheck,
  Store,
  ClipboardCheck,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";
import { getMyAccess } from "@/lib/partnercare.functions";
import { usePartnerCopy } from "@/lib/partner-onboarding.copy";
import { useDoctorCopy } from "@/lib/doctor-recruitment.copy";
import { useIntakeCopy } from "@/lib/partner-intake.copy";
import { ReleaseBanner } from "@/components/ReleaseReadiness";
import { MotionSection, SiteTheme, useSiteTheme } from "@/components/SiteTheme";
import { surfaceForPath, canReadSurface } from "@/lib/site-settings";

const NAV = [
  { to: "/care", key: "nav.care", icon: Wallet },
  { to: "/care-patient", key: "nav.carePatient", icon: HeartPulse },
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/clinic", key: "nav.clinic", icon: ClipboardPlus },
  { to: "/partners", key: "nav.partners", icon: Building2 },
  { to: "/locations", key: "nav.locations", icon: MapPin },
  { to: "/services", key: "nav.services", icon: Sparkles },
  { to: "/therapists", key: "nav.therapists", icon: Hand },
  { to: "/bookings", key: "nav.bookings", icon: CalendarDays },
  { to: "/patients", key: "nav.patients", icon: Users },
  { to: "/consultations", key: "nav.consultations", icon: Stethoscope },
  { to: "/doctor", key: "nav.careTeam", icon: Stethoscope },
  { to: "/credits", key: "nav.credits", icon: Coins },
  { to: "/finance", key: "nav.finance", icon: Wallet },
  { to: "/shop", key: "nav.shop", icon: ShoppingBag },
  { to: "/integrations", key: "nav.integrations", icon: PlugZap },
  { to: "/portal", key: "nav.portal", icon: HeartPulse },
  { to: "/audit", key: "nav.audit", icon: ScrollText },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const accessFn = useServerFn(getMyAccess);
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: () => accessFn({}) });
  const scope = surfaceForPath(pathname);
  const allowed = canReadSurface(scope, access?.roles ?? []);
  return <SiteTheme scope={scope} allowed={allowed}><AppShellContent>{children}</AppShellContent></SiteTheme>;
}

function AppShellContent({ children }: { children: ReactNode }) {
  const { name, theme } = useSiteTheme();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(theme?.collapsed ?? false); }, [theme?.collapsed]);
  const { t } = useI18n();
  const l = usePartnerCopy();
  const dl = useDoctorCopy();
  const ic = useIntakeCopy();
  const accessFn = useServerFn(getMyAccess);
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: () => accessFn({}) });
  const roles = access?.roles.filter(r => r.status === "ACTIVE") ?? [];
  const global = roles.some(r => r.partnerId === null && ["SUPER_ADMIN", "OPERATIONS_ADMIN"].includes(r.role));
  const reviewer = global || roles.some(r => r.role === "OPERATIONS_ADMIN");
  const partner = roles.some(r => ["PARTNER_OWNER", "PARTNER_MANAGER", "PARTNER_STAFF"].includes(r.role));
  const doctor = roles.some(r => r.role === "DOCTOR");
  const finance = roles.some(r => r.role === "FINANCE_ADMIN" || r.role === "COMPLIANCE_AUDITOR");
  const workspaceRole = roles.find(r => r.role === "SUPER_ADMIN")?.role
    ?? roles.find(r => r.role === "OPERATIONS_ADMIN")?.role
    ?? roles.find(r => r.role === "DOCTOR")?.role
    ?? roles.find(r => ["PARTNER_OWNER", "PARTNER_MANAGER", "PARTNER_STAFF"].includes(r.role))?.role
    ?? "CUSTOMER";
  const roleLabel = workspaceRole.replaceAll("_", " ");
  const roleIcon = workspaceRole === "DOCTOR" ? Stethoscope : workspaceRole.startsWith("PARTNER") ? Store : workspaceRole === "SUPER_ADMIN" ? ShieldCheck : ClipboardCheck;
  const mobileLinks = global
    ? [{ to: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard }, { to: "/admin-console", label: ic("งาน", "Operations"), icon: ClipboardPlus }, { to: "/doctor-recruitment", label: ic("แพทย์", "Doctors"), icon: Stethoscope }, { to: "/notifications", label: ic("แจ้งเตือน", "Alerts"), icon: Bell }]
    : doctor
      ? [{ to: "/doctor-workspace", label: dl("workspaceTitle"), icon: Stethoscope }, { to: "/requests", label: ic("คำขอ", "Requests"), icon: ClipboardPlus }, { to: "/care", label: ic("การดูแล", "Care"), icon: HeartPulse }, { to: "/notifications", label: ic("แจ้งเตือน", "Alerts"), icon: Bell }]
      : [{ to: "/partner-workspace", label: ic("ภาพรวม", "Overview"), icon: LayoutDashboard }, { to: "/partner-customers", label: ic("ลูกค้า", "Customers"), icon: Users }, { to: "/requests", label: ic("การปรึกษา", "Consultations"), icon: Stethoscope }, { to: "/notifications", label: ic("แจ้งเตือน", "Alerts"), icon: Bell }];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (pathname === "/partner-onboarding") return <div className="min-h-screen bg-background"><header className="flex justify-end gap-3 border-b border-border px-6 py-3"><Button variant="ghost" onClick={signOut}><LogOut className="size-4" />{t("nav.signOut")}</Button></header><main className="px-5 py-8">{children}</main></div>;

  return (
    <div className={`workspace-shell min-h-screen bg-background lg:flex ${theme?.navigation === "topbar" ? "workspace-topbar" : ""} ${theme && collapsed ? "workspace-collapsed" : ""}`} data-role={workspaceRole}>
      <aside className="workspace-navigation bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="brand-gradient inline-flex size-9 items-center justify-center rounded-xl text-sm font-semibold text-primary-foreground">
            TK
          </span>
          <span className="workspace-brand min-w-0 break-words font-display text-sm font-semibold leading-tight">{name || t("brand.name")}</span>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible">
          <Link to="/notifications" search={{manage:false,status:'',unread:false}} className="px-3 py-2 text-sm">{ic('การแจ้งเตือน','Notifications')}</Link>
          <Link to="/partner-onboarding" className="px-3 py-2 text-sm">{l("title")}</Link>
          {reviewer && <Link to="/partner-review" className="px-3 py-2 text-sm">{l("reviewTitle")}</Link>}
          {reviewer && <Link to="/admin-console" className="px-3 py-2 text-sm">{ic('ศูนย์ปฏิบัติการ Admin','Admin operations')}</Link>}
          {global && <Link to="/release-readiness" className="px-3 py-2 text-sm">{ic('ความพร้อมก่อนเผยแพร่','Release readiness')}</Link>}
          {reviewer && <Link to="/sla" className="px-3 py-2 text-sm">{ic('SLA และการยกระดับ','SLA & escalation')}</Link>}
          {roles.some(r=>(r.role==='OPERATIONS_ADMIN'&&r.partnerId!==null)||(r.role==='SUPER_ADMIN'&&r.partnerId===null))&&<Link to="/credit-reconciliation" className="px-3 py-2 text-sm">{ic('กระทบยอดเครดิต','Credit reconciliation')}</Link>}
          {roles.some(r=>r.role==='SUPER_ADMIN'&&r.partnerId===null)&&<Link to="/credit-health" className="px-3 py-2 text-sm">{ic('ภาพรวมบัญชีควบคุม','Credit control aggregates')}</Link>}
          {roles.some(r=>r.role==='OPERATIONS_ADMIN'&&r.partnerId!==null)&&<Link to="/privacy" className="px-3 py-2 text-sm">{ic('ศูนย์ความเป็นส่วนตัว','Privacy center')}</Link>}
          {roles.some(r=>r.role==='SUPER_ADMIN'&&r.partnerId===null)&&<Link to="/privacy-health" className="px-3 py-2 text-sm">{ic('ภาพรวมความเป็นส่วนตัว','Privacy aggregates')}</Link>}
          {roles.some(r => r.role === 'SUPER_ADMIN' && r.partnerId === null) && <><Link to="/sla-health" className="px-3 py-2 text-sm">{ic('ภาพรวม SLA','SLA aggregates')}</Link><Link to="/system-health" className="px-3 py-2 text-sm">{ic('สถานะระบบ','System health')}</Link></>}
          {roles.some(r => r.role === 'SUPER_ADMIN' && r.partnerId === null) && <Link to="/superadmin-console" className="px-3 py-2 text-sm">{ic('ภาพรวม Superadmin','Superadmin health')}</Link>}
          {roles.some(r => r.role === 'SUPER_ADMIN' && r.partnerId === null) && <Link to="/site-settings" className="px-3 py-2 text-sm">Site Settings</Link>}
          {reviewer && !global && <Link to="/audit" className="px-3 py-2 text-sm">{t('nav.audit')}</Link>}
          {partner && <Link to="/partner-workspace" className="px-3 py-2 text-sm">{l("workspace")}</Link>}
          {reviewer && <Link to="/doctor-recruitment" className="px-3 py-2 text-sm">{dl("adminTitle")}</Link>}
          {doctor && <Link to="/doctor-workspace" className="px-3 py-2 text-sm">{dl("workspaceTitle")}</Link>}
          {(partner || reviewer || doctor || finance) && <Link to="/partner-customers" className="px-3 py-2 text-sm">{ic('ลูกค้าและคำขอปรึกษา','Customers & intake')}</Link>}
          {(partner || reviewer || doctor) && <Link to="/requests" className="px-3 py-2 text-sm">{ic('คำขอปรึกษา','Consultation requests')}</Link>}
          {(partner || reviewer) && <Link to="/mcs-handoff" className="px-3 py-2 text-sm">{ic('คิวส่งต่อ MCS','MCS handoff queue')}</Link>}
          {(partner || reviewer || doctor) && <Link to="/certificates" className="px-3 py-2 text-sm">{ic('เอกสารใบรับรอง','Certificate documents')}</Link>}
          {NAV.filter(n => global || (doctor && n.to === "/doctor") || (partner && ["/care", "/locations"].includes(n.to)) || (finance && ["/finance", "/audit"].includes(n.to)) || (!partner && !doctor && !reviewer && !finance && ["/care-patient", "/portal"].includes(n.to))).map(({ to, key, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {t(key)}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="workspace-main flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-card px-6 py-3">
          <div className="workspace-context">
            {(() => { const Icon = roleIcon; return <span className="workspace-role-badge"><Icon className="size-4" />{roleLabel}</span>; })()}
            <span className="workspace-context-scope hidden text-xs text-muted-foreground md:inline">{name || t("brand.name")} · {ic("ขอบเขตที่ได้รับอนุญาต", "Authorised scope active")}</span>
          </div>
          <Button variant="ghost" size="icon" asChild aria-label={ic("การแจ้งเตือน", "Notifications")}><Link to="/notifications" search={{ manage: false, status: "", unread: false }}><Bell className="size-4" /></Link></Button>
          {theme && <Button variant="outline" size="sm" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>{collapsed ? "Expand navigation" : "Collapse navigation"}</Button>}
          <LanguageSwitcher className="h-9 w-[150px]" />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" />
            {t("nav.signOut")}
          </Button>
        </header>
        <ReleaseBanner />
        <div className="workspace-security-strip"><ShieldCheck className="mr-1 inline size-3.5" />{ic("พื้นที่ทำงานปลอดภัย · ใช้ขอบเขตองค์กรที่ได้รับอนุญาต", "Secure workspace · organisation scope active")}</div>
        <main className="flex-1 px-6 py-8"><MotionSection>{children}</MotionSection></main>
        <nav className="workspace-mobile-nav" aria-label={ic("เมนูหลักบนมือถือ", "Mobile navigation")}>
          {mobileLinks.map(({ to, label, icon: Icon }) => to === "/notifications"
            ? <Link key={to} to="/notifications" search={{ manage: false, status: "", unread: false }} data-active={pathname.startsWith(to)}><Icon className="size-5" /><span>{label}</span></Link>
            : <Link key={to} to={to as never} data-active={pathname.startsWith(to)}><Icon className="size-5" /><span>{label}</span></Link>)}
        </nav>
      </div>
    </div>
  );
}
