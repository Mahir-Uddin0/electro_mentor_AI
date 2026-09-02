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
import { useLanguage } from "@/components/language-provider";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: Grid2X2 },
  { label: "Guide Library", href: "/guides", icon: BookOpen },
  { label: "AI Assistant", href: "/assistant", icon: Bot },
  { label: "Photo Analysis", href: "/photo-analysis", icon: Camera },
  { label: "Safety Checklists", href: "/safety-checklists", icon: CheckSquare },
  { label: "Task Tracker", href: "/practice-tracker", icon: ListChecks },
];

function getRouteTitle(pathname: string, t: (text: string) => string) {
  if (pathname.startsWith("/guides")) return [t("Guide Library"), t("Learning resources")];
  if (pathname.startsWith("/assistant")) return [t("AI Assistant"), t("Electrical mentor")];
  if (pathname.startsWith("/photo-analysis")) return [t("Photo Analysis"), t("AI fault detection")];
  if (pathname.startsWith("/safety-checklists")) return [t("Safety Checklists"), t("Safe workshop practice")];
  if (pathname.startsWith("/practice-tracker")) return [t("Task Tracker"), t("Work progress")];
  if (pathname.startsWith("/settings")) return [t("Settings"), t("Account preferences")];
  if (pathname.startsWith("/assessments")) return [t("Practical Assessment"), t("AI work evaluation")];
  return [t("Dashboard"), t("AI platform")];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, configured, session, previewMode, user, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [title, subtitle] = useMemo(() => getRouteTitle(pathname, t), [pathname, t]);

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
    return <div className="full-loader"><span className="spinner" /> {t("Securing your workspace…")}</div>;
  }

  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Prince Jayed Khan";

  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label={t("Close menu")} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand-row">
          <Brand />
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label={t("Close navigation")}>
            <X size={19} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label={t("Primary navigation")}>
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <item.icon size={18} />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="language-switch" aria-label={t("Language selection")}>
            {(["en", "bn"] as const).map((item) => (
              <button key={item} className={language === item ? "active" : ""} onClick={() => setLanguage(item)}>{item.toUpperCase()}</button>
            ))}
          </div>
          <button className="sidebar-action" onClick={() => setDark((value) => !value)}>
            <Moon size={17} /> {dark ? t("Light mode") : t("Dark")}
          </button>
          <Link className="sidebar-action" href="/settings">
            <Settings size={17} /> {t("Settings")}
          </Link>
          <button className="sidebar-action" onClick={async () => { await signOut(); router.push("/login"); }}>
            <LogOut size={17} /> {t("Sign out")}
          </button>
          <div className="profile-chip">
            <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{displayName}</strong><small>{previewMode ? t("Preview student") : t("Student")}</small></span>
          </div>
        </div>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label={t("Open navigation")}>
            <Menu size={20} />
          </button>
          <div className="topbar-title"><strong>{title}</strong><span>{subtitle}</span></div>
          <label className="global-search">
            <Search size={17} />
            <input aria-label={t("Search")} placeholder={t("Search projects, lessons, tools…")} />
            <kbd>⌘K</kbd>
          </label>
          <div className="topbar-actions">
            <button className="icon-button desktop-only" aria-label={t("Language")} onClick={() => setLanguage(language === "en" ? "bn" : "en")}><Languages size={18} /></button>
            <button className="install-button desktop-only"><Download size={16} /> {t("Install")}</button>
            <button className="icon-button notification" aria-label={t("Notifications")}><Bell size={18} /><i>3</i></button>
            <span className="top-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
      <Link href="/assistant" className="floating-assistant" aria-label={t("Open AI Assistant")}><Bot size={21} /></Link>
    </div>
  );
}
