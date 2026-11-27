import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  UserCog,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  ScanFace,
  DoorOpen,
  FileText,
  Globe,
  Bot,
  Settings,
  Activity,
  Building2,
  ListChecks,
  Rows3,
  Rows4,
  BookOpen,
  GraduationCap,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/common/CommandPalette";
import { ModeBadge } from "@/components/common/ModeBadge";
import { EvidenceLightboxProvider } from "@/components/common/EvidenceLightbox";
import { useDensity } from "@/hooks/use-density";
import { clearAuthSession, getAuthSession, redirectForRole, roleCanAccess, type Role } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { BrandLockup, NoonMark } from "@/components/brand/Brand";

const nav = [
  { to: "/monitor", label: "Live Monitor", icon: Activity, roles: ["instructor", "admin"] },
  { to: "/instructor", label: "Examiner Dashboard", icon: Users, roles: ["instructor", "admin"] },
  { to: "/bank", label: "Question Bank", icon: BookOpen, roles: ["instructor", "admin"] },
  { to: "/candidate", label: "My Exams", icon: GraduationCap, roles: ["student"] },
  { to: "/setup", label: "Exam Setup", icon: ListChecks, roles: ["student", "admin"] },
  { to: "/checklist", label: "Secure Checklist", icon: ClipboardCheck, roles: ["student", "admin"] },
  { to: "/id-verification", label: "ID Verification", icon: ScanFace, roles: ["student", "admin"] },
  { to: "/room-scan", label: "Room Scan", icon: DoorOpen, roles: ["student", "admin"] },
  { to: "/browser-guard", label: "Browser Guard", icon: Globe, roles: ["student", "instructor", "admin"] },
  { to: "/assistant", label: "Guide Assistant", icon: Bot, roles: ["student", "instructor", "admin"] },
  { to: "/reports", label: "Reports", icon: FileText, roles: ["student", "instructor", "admin"] },
  { to: "/admin", label: "Admin Console", icon: Building2, roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
  { to: "/account", label: "Account", icon: UserCog, roles: ["student", "instructor", "admin"] },
] as const;

export function AppShell({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "exam" }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [checked, setChecked] = useState(false);
  const [role, setRole] = useState<Role | undefined>(getAuthSession()?.user.role);

  useEffect(() => {
    const guestRoute = ["/login", "/register", "/forgot-password", "/reset-password"].some(
      (route) => pathname === route,
    );
    if (guestRoute) {
      setChecked(true);
      return;
    }
    const session = getAuthSession();
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (!roleCanAccess(session.user.role, pathname)) {
      navigate({ to: redirectForRole(session.user.role) });
      return;
    }
    setRole(session.user.role);
    api.me().catch((err) => {
      // Network failures (offline, server restarting, aborted navigation) must not sign the
      // candidate out mid-exam; only a definitive 401 ends the session.
      if (err instanceof ApiError && err.status === 401) {
        clearAuthSession();
        navigate({ to: "/login" });
      }
    });
    setChecked(true);
  }, [navigate, pathname]);

  if (!checked) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading Nigran 360...
      </div>
    );
  }

  const skip = (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      {variant === "exam" ? "Skip to question" : "Skip to content"}
    </a>
  );

  if (variant === "exam") {
    // Focused exam layout: no global navigation, search or account controls during an attempt.
    return (
      <EvidenceLightboxProvider>
        {skip}
        <div className="min-h-screen w-full bg-background">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 md:px-6">
            <BrandLockup size="sm" />
            <span className="hidden text-sm text-muted-foreground sm:inline">Examination</span>
            <Link
              to="/candidate"
              className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                if (!window.confirm("Leave the exam workspace? Your timer keeps running on the server.")) event.preventDefault();
              }}
            >
              Exit to dashboard
            </Link>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] p-3 md:p-6 focus:outline-none">
            {children}
          </main>
        </div>
      </EvidenceLightboxProvider>
    );
  }

  return (
    <EvidenceLightboxProvider>
      {skip}
      <div className="relative min-h-screen w-full">
        <div className="relative flex min-h-screen w-full">
          <Sidebar role={role} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 focus:outline-none md:p-6">{children}</main>
          </div>
        </div>
      </div>
    </EvidenceLightboxProvider>
  );
}

function Sidebar({ role }: { role?: Role }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visibleNav = nav.filter((n) => role && (n.roles as readonly Role[]).includes(role));
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
      <div className="flex items-center px-4 pb-2 pt-3">
        <Link to="/" aria-label="Nigran 360 home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandLockup size="md" />
        </Link>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-2 pb-4" aria-label="Primary">
        {visibleNav.map((n) => {
          const Icon = n.icon;
          const active = pathname === n.to || pathname.startsWith(n.to + "/");
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                active
                  ? "bg-white/10 text-foreground shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.06)]"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn("h-4 w-4 transition-colors", active && "text-primary")}
                aria-hidden
              />
              {n.label}
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = nav.find((n) => pathname === n.to || pathname.startsWith(n.to + "/"));
  const { density, toggle } = useDensity();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 md:px-6">
      <Link
        to="/"
        className="md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg"
        aria-label="Nigran 360 home"
      >
        <NoonMark className="h-8 w-8" />
      </Link>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LayoutDashboard className="h-4 w-4" aria-hidden />
        <span className="text-foreground">{current?.label ?? (pathname.startsWith("/exam-results") ? "Results & Analytics" : pathname.startsWith("/exam") ? "Examination" : pathname.startsWith("/sessions") ? "Session Review" : "Overview")}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ModeBadge />
        <CommandPalette trigger />
        <button
          type="button"
          onClick={toggle}
          aria-label={`Switch to ${density === "comfortable" ? "compact" : "comfortable"} density`}
          title={`Density: ${density}`}
          className="inline-grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          {density === "compact" ? (
            <Rows4 className="h-4 w-4" aria-hidden />
          ) : (
            <Rows3 className="h-4 w-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            api.logout();
            navigate({ to: "/login" });
          }}
          className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
