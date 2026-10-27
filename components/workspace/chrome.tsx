"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Box,
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  ScanLine,
  Clock3,
  RotateCcw,
  CheckCheck,
  Factory,
  Building2,
  Bell,
  ChartNoAxesCombined,
  Settings2,
  ShieldCheck,
  Layers,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Search,
  ChevronRight,
} from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
import type { WorkspaceState, Role } from "@/lib/models";
const icons = {
  home: LayoutDashboard,
  projects: FolderKanban,
  tasks: ListTodo,
  internal: ScanLine,
  approval: Clock3,
  changes: RotateCcw,
  ready: CheckCheck,
  packages: Factory,
  clients: Building2,
  notifications: Bell,
  reports: ChartNoAxesCombined,
  settings: Settings2,
  audit: ShieldCheck,
  allArtworks: Layers,
  approvedVersions: CheckCheck,
  clientComments: MessageSquare,
  clientHistory: Clock3,
};
type View = keyof typeof icons;
const groups: Record<Role, View[][]> = {
  admin: [
    ["home", "projects", "tasks"],
    ["internal", "approval", "changes", "ready", "packages"],
    ["clients", "settings", "reports", "audit", "notifications"],
  ],
  manager: [
    ["home", "projects", "tasks"],
    ["internal", "approval", "changes", "ready", "packages"],
    ["clients", "reports", "settings", "notifications"],
  ],
  designer: [
    ["home", "tasks", "projects"],
    ["changes", "internal", "approval"],
    ["notifications"],
  ],
  prepress: [
    ["home", "internal", "tasks"],
    ["projects", "changes", "approval"],
    ["notifications"],
  ],
  approver: [
    ["home", "projects", "approval"],
    ["allArtworks", "approvedVersions", "clientComments", "clientHistory"],
    ["notifications"],
  ],
  observer: [
    ["home", "projects"],
    ["allArtworks", "approvedVersions", "clientComments", "clientHistory"],
    ["notifications"],
  ],
  production: [["packages"], ["notifications"]],
};
export default function WorkspaceChrome({
  data: d,
  locale,
  view,
  search,
  onSearch,
  onGo,
  onLocale,
  onLogout,
  children,
  onRefresh,
}: {
  data: WorkspaceState;
  locale: Locale;
  view: string;
  search: string;
  onSearch: (v: string) => void;
  onGo: (v: string) => void;
  onLocale: () => void;
  onLogout: () => void;
  children: ReactNode;
  onRefresh: () => void;
}) {
  const [mobile, M] = useState(false),
    menu = useRef<HTMLButtonElement>(null),
    nav = useRef<HTMLElement>(null),
    t = (k: string) => translate(locale, k),
    kz = locale === "kz";
  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nav.current?.querySelector<HTMLButtonElement>("nav button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        M(false);
        menu.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", key);
    };
  }, [mobile]);
  const activeView =
    view === "home" && d.user.role === "production" ? "packages" : view;
  const choose = (v: string) => {
    onGo(v);
    M(false);
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-main">
        {kz ? "Мазмұнға өту" : "К содержимому"}
      </a>
      <aside
        ref={nav}
        className={`sidebar ${mobile ? "mobile-open" : ""}`}
        aria-label={kz ? "Негізгі навигация" : "Основная навигация"}
      >
        <div className="brand">
          <span className="brand-icon">
            <Box size={23} />
          </span>
          <b>
            Pack<span>Approve</span>
          </b>
          <button
            className="mobile-close icon-btn"
            aria-label={kz ? "Мәзірді жабу" : "Закрыть меню"}
            onClick={() => {
              M(false);
              menu.current?.focus();
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <div className="company-icon">Q</div>
          <div>
            <b>QAZALPACK</b>
            <small>
              {t(d.user.role === "production" ? "productionRole" : d.user.role)}
            </small>
          </div>
        </div>
        <nav>
          {groups[d.user.role].map((group, index) => (
            <div className="nav-section" key={index}>
              <span className="nav-label">
                {index === 0
                  ? kz
                    ? "ЖҰМЫС"
                    : "РАБОТА"
                  : index === 1
                    ? kz
                      ? "ҮДЕРІС"
                      : "ПРОЦЕСС"
                    : kz
                      ? "БАСҚАРУ"
                      : "УПРАВЛЕНИЕ"}
              </span>
              {group.map((key) => {
                const Icon = icons[key];
                return (
                  <button
                    key={key}
                    onClick={() => choose(key)}
                    className={activeView === key ? "selected" : ""}
                    aria-current={activeView === key ? "page" : undefined}
                  >
                    <Icon size={19} />
                    <span>{t(key)}</span>
                    {key === "approval" && !!d.metrics?.awaiting && (
                      <b className="nav-count">{d.metrics.awaiting}</b>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="user-card" onClick={onLogout} title={t("logout")}>
            <span className="avatar av-1">
              {d.user.full_name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <b>{d.user.full_name}</b>
              <small>{t("logout")}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobile && <div className="overlay" onClick={() => M(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button
            ref={menu}
            className="mobile-menu icon-btn"
            aria-label={kz ? "Мәзір" : "Меню"}
            aria-expanded={mobile}
            onClick={() => M(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>{t("workspace")}</span>
            <ChevronRight size={14} />
            <b>
              {t(["project", "artwork"].includes(view) ? "projects" : view)}
            </b>
          </div>
          <div className="header-actions">
            {[
              "projects",
              "home",
              "tasks",
              "changes",
              "internal",
              "approval",
            ].includes(view) && (
              <label className="search-input">
                <Search size={17} />
                <span className="sr-only">{t("search")}</span>
                <input
                  value={search}
                  aria-label={t("search")}
                  placeholder={t("search")}
                  onChange={(e) => onSearch(e.target.value)}
                />
              </label>
            )}
            <button
              className="icon-btn"
              aria-label={kz ? "Деректерді жаңарту" : "Обновить данные"}
              title={kz ? "Деректерді жаңарту" : "Обновить данные"}
              onClick={onRefresh}
            >
              <RotateCcw size={18} />
            </button>
            <button
              className="language"
              onClick={onLocale}
              aria-label={kz ? "Тілді ауыстыру" : "Сменить язык"}
            >
              {locale.toUpperCase()}
            </button>
            <button
              className="notification-btn icon-btn"
              aria-label={t("notifications")}
              onClick={() => choose("notifications")}
            >
              <Bell size={20} />
              {(d.metrics?.unread ||
                d.notifications.some((n) => !n.read_at)) && <i />}
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
