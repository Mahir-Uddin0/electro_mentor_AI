"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  Bot,
  Camera,
  CheckSquare,
  Download,
  Grid2X2,
  Languages,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Brand } from "@/components/brand";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: Grid2X2 },
  { label: "Guide Library", href: "/guides", icon: BookOpen },
  { label: "AI Assistant", href: "/assistant", icon: Bot },
  { label: "Photo Analysis", href: "/photo-analysis", icon: Camera },
  { label: "Safety Checklists", href: "/safety-checklists", icon: CheckSquare },
  { label: "Task Tracker", href: "/practice-tracker", icon: ListChecks },
];

function getRouteTitle(pathname: string) {
  if (pathname.startsWith("/guides")) return ["Guide Library", "Learning resources"];
  if (pathname.startsWith("/assistant")) return ["AI Assistant", "Electrical mentor"];
  if (pathname.startsWith("/photo-analysis")) return ["Photo Analysis", "AI fault detection"];
  if (pathname.startsWith("/safety-checklists")) return ["Safety Checklists", "Safe workshop practice"];
  if (pathname.startsWith("/practice-tracker")) return ["Task Tracker", "Work progress"];
  if (pathname.startsWith("/settings")) return ["Settings", "Account preferences"];
  if (pathname.startsWith("/assessments")) return ["Practical Assessment", "AI assessment"];
  return ["Dashboard", "AI platform"];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, configured, session, previewMode, user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [language, setLanguage] = useState<"EN" | "BN">("EN");
  const [title, subtitle] = useMemo(() => getRouteTitle(pathname), [pathname]);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!loading && configured && !session && !previewMode) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, configured, session, previewMode, pathname, router]);

  if (loading || (configured && !session && !previewMode)) {
    return <div className="full-loader"><span className="spinner" /> Securing your workspace…</div>;
  }

  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Prince Jayed Khan";

  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand-row">
          <Brand />
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="language-switch" aria-label="Language selection">
            {(["EN", "BN"] as const).map((item) => (
              <button key={item} className={language === item ? "active" : ""} onClick={() => setLanguage(item)}>{item}</button>
            ))}
          </div>
          <button className="sidebar-action" onClick={() => setDark((value) => !value)}>
            <Moon size={17} /> {dark ? "Light mode" : "Dark"}
          </button>
          <Link className="sidebar-action" href="/settings">
            <Settings size={17} /> Settings
          </Link>
          <button className="sidebar-action" onClick={async () => { await signOut(); router.push("/login"); }}>
            <LogOut size={17} /> Sign out
          </button>
          <div className="profile-chip">
            <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{displayName}</strong><small>{previewMode ? "Preview student" : "Student"}</small></span>
          </div>
        </div>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div className="topbar-title"><strong>{title}</strong><span>{subtitle}</span></div>
          <label className="global-search">
            <Search size={17} />
            <input aria-label="Search" placeholder="Search projects, lessons, tools…" />
            <kbd>⌘K</kbd>
          </label>
          <div className="topbar-actions">
            <button className="icon-button desktop-only" aria-label="Language"><Languages size={18} /></button>
            <button className="install-button desktop-only"><Download size={16} /> Install</button>
            <button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i>3</i></button>
            <span className="top-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
      <Link href="/assistant" className="floating-assistant" aria-label="Open AI Assistant"><Bot size={21} /></Link>
    </div>
  );
}
