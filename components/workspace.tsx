"use client";
import { useCallback, useEffect, useState } from "react";
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
  Search,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  MoreHorizontal,
  FileText,
  Download,
  Check,
  X,
  MessageSquare,
  Layers,
  LockKeyhole,
  LogOut,
  Menu,
  Maximize2,
  ZoomIn,
  ZoomOut,
  UploadCloud,
  Loader2,
  CalendarDays,
  Users,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Send,
} from "lucide-react";
import { translate, eventKeys, type Locale } from "@/lib/i18n";
import PdfViewer from "./pdf-viewer";
import dynamic from "next/dynamic";
import * as StudioTabs from "@radix-ui/react-tabs";
const CanStudio = dynamic(() => import("./can-studio/studio"), {
  ssr: false,
  loading: () => <div className="empty">Can Studio…</div>,
});
import ActionModal from "./action-modal";
import SetupWizard from "./setup-wizard";
import PeopleManagement from "./people-management";
import { operationalItems } from "@/lib/workflow";
import Operations, { FileCover, WorkflowSteps } from "./operations";
export type Row = Record<string, any>;
export type State = Record<string, Row[]> & { user: any };
const nav = [
  ["home", LayoutDashboard],
  ["projects", FolderKanban],
  ["tasks", ListTodo],
  ["internal", ScanLine],
  ["approval", Clock3],
  ["changes", RotateCcw],
  ["ready", CheckCheck],
  ["packages", Factory],
  ["clients", Building2],
  ["notifications", Bell],
  ["reports", ChartNoAxesCombined],
  ["settings", Settings2],
  ["audit", ShieldCheck],
] as const;
export default function Workspace() {
  const [locale, L] = useState<Locale>("ru");
  const t = (k: string) => translate(locale, k);
  const [data, D] = useState<State | null>(null);
  const [view, V] = useState("home");
  const [projectId, PI] = useState("");
  const [artworkId, AI] = useState("");
  const [versionId, VI] = useState("");
  const [search, S] = useState("");
  const [filter, F] = useState("all");
  const [error, E] = useState("");
  const [modal, M] = useState<Row | null>(null);
  const [busy, B] = useState(false);
  const [mobile, MB] = useState(false);
  const [tab, T] = useState("comments");
  const [zoom, Z] = useState(1);
  const [page, PG] = useState(1);
  const [pages, PGS] = useState(1);
  const [compare, C] = useState(false);
  const [previewMode, MODE] = useState("2d");
  const [compareId, CI] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.status === 401) {
      location.href = "/login?reason=session-expired";
      return;
    }
    const j = await r.json();
    if (!r.ok) throw Error(j.error);
    D(j);
  }, []);
  useEffect(() => {
    load().catch((e) => E(e.message));
    const loc = localStorage.getItem("pa_locale");
    if (loc === "kz") L(loc);
    const restore = () => {
      const q = new URLSearchParams(location.search);
      AI(q.get("artwork") || "");
      PI(q.get("project") || "");
      VI(q.get("version") || "");
      V(
        q.has("artwork")
          ? "artwork"
          : q.has("project")
            ? "project"
            : q.get("view") || "home",
      );
      F("all");
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [load]);
  useEffect(() => {
    document.documentElement.lang = locale === "kz" ? "kk" : "ru";
    localStorage.setItem("pa_locale", locale);
  }, [locale]);
  async function command(
    action: string,
    entityId?: string,
    payload: Row = {},
    rowVersion?: number,
  ) {
    B(true);
    E("");
    try {
      const r = await fetch("/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ action, entityId, payload, rowVersion }),
      });
      const j = await r.json();
      if (r.status === 401) {
        location.href = "/login?reason=session-expired";
        throw Error("Сессия истекла. Войдите снова.");
      }
      if (!r.ok) throw Error(j.error);
      await load();
      M(
        j.invitationUrl
          ? {
              action: "invitation.link",
              url: location.origin + j.invitationUrl,
            }
          : null,
      );
      return j;
    } catch (e) {
      E((e as Error).message);
      throw e;
    } finally {
      B(false);
    }
  }
  function openProject(id: string) {
    PI(id);
    V("project");
    history.pushState(null, "", `/?project=${id}`);
  }
  function openArtwork(a: Row) {
    AI(a.id);
    PI(a.project_id);
    VI("");
    V("artwork");
    T("comments");
    C(false);
    MODE("2d");
    PG(1);
    history.pushState(null, "", `/?artwork=${a.id}`);
  }
  function go(v: string) {
    V(v);
    MB(false);
    AI("");
    PI("");
    history.pushState(null, "", `/?view=${v}`);
  }
  if (!data)
    return (
      <div className="loading-screen">
        <Box size={35} />
        <b>PackApprove</b>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <Loader2 className="spin" />
        )}
      </div>
    );
  const d = data;
  const studioArtworks=d.artworks.filter(a=>d.visualizations?.some(v=>v.version_id===a.active_version_id));
  const homeArtworks=studioArtworks.length?studioArtworks:d.artworks;
  const u = d.user;
  const staff = ["admin", "manager", "designer", "prepress"].includes(u.role);
  const manage = ["admin", "manager"].includes(u.role);
  const client = ["observer", "approver"].includes(u.role);
  const production = u.role === "production";
  const name = (id: string) =>
    d.profiles.find((p) => p.id === id)?.full_name || t("user");
  const date = (v: string) =>
    new Date(v).toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ", {
      day: "numeric",
      month: "short",
    });
  const badge = (status: string) => (
    <span className={`badge ${status}`}>
      <i />
      {t(status === "open" ? "openRound" : status)}
    </span>
  );
  const event = (a: string) => t(eventKeys[a] || a);
  const artwork = d.artworks.find((a) => a.id === artworkId);
  const project = d.projects.find(
    (p) => p.id === (projectId || artwork?.project_id),
  );
  const versions = d.versions.filter((v) => v.artwork_id === artworkId);
  const selected =
    versions.find((v) => v.id === (versionId || artwork?.active_version_id)) ||
    versions[0];
  const round = d.rounds.find((r) => r.version_id === selected?.id);
  const review = d.reviews.find((r) => r.version_id === selected?.id);
  const threads = d.threads.filter((x) => x.version_id === selected?.id);
  const files = d.files.filter((x) => x.version_id === selected?.id);
  const preview = files.find((f) => f.kind === "preview");
  const active = selected?.id === artwork?.active_version_id;
  const meDecision = d.decisions.find(
    (x) => x.round_id === round?.id && x.user_id === u.id,
  );
  const pending = d.rounds.filter((r) => r.status === "open");
  const late = pending.filter((r) => new Date(r.deadline) < new Date());
  const artworkStatus = (a: Row) => {
    const v = d.versions.find((v) => v.id === a.active_version_id);
    return v?.status || a.status;
  };
  let visibleProjects = d.projects.filter((p) =>
    `${p.name} ${p.organization_name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const wanted =
    view === "internal"
      ? "internal_review"
      : view === "approval"
        ? "published"
        : view === "changes"
          ? "changes_requested"
          : view === "ready"
            ? "approved"
            : filter;
  if (!["all", "home", "projects"].includes(wanted) && wanted !== "all")
    visibleProjects = visibleProjects.filter((p) =>
      d.artworks.some(
        (a) =>
          a.project_id === p.id &&
          (wanted === "production"
            ? a.status === "production"
            : wanted === "active"
              ? ["draft", "in_progress"].includes(a.status)
              : artworkStatus(a) === wanted),
      ),
    );
  if (view === "tasks")
    visibleProjects = visibleProjects.filter((p) =>
      [p.manager_id, p.designer_id, p.prepress_id].includes(u.id),
    );
  const openModal = (action: string, extra: Row = {}) => {
    E("");
    M({ action, entityId: selected?.id, ...extra });
  };
  const renderArtworks = (items: Row[]) => (
    <div className="artwork-grid">
      {items.length ? (
        items.map((a, i) => {
          const v = d.versions.find((v) => v.id === a.active_version_id);
          return (
            <button
              className="artwork-card"
              key={a.id}
              onClick={() => openArtwork(a)}
            >
              <div className={`artwork-cover color-${i % 4}`}>
                <FileCover data={d} artwork={a} />
                <span className="version-chip">V{v?.number || "—"}</span>
              </div>
              <div className="artwork-card-info">
                <small>{a.packaging_type}</small>
                <h3>{a.name}</h3>
                <div>
                  {badge(artworkStatus(a))}
                  <span className="muted">
                    <CalendarDays size={13} />
                    {date(a.deadline)}
                  </span>
                </div>
              </div>
            </button>
          );
        })
      ) : (
        <div className="empty">{t("empty")}</div>
      )}
    </div>
  );
  const projectTable = () => (
    <div className="project-table-wrap">
      <table className="project-table">
        <thead>
          <tr>
            <th>{t("project")}</th>
            <th>{t("artworks")}</th>
            <th>{t("status")}</th>
            <th>{t("deadline")}</th>
            <th>{t("team")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visibleProjects.map((p, i) => {
            const aa = d.artworks.filter((a) => a.project_id === p.id);
            const approved = aa.filter((a) =>
              ["approved", "production"].includes(a.status),
            ).length;
            const isLate =
              new Date(p.deadline) < new Date() && p.status === "active";
            return (
              <tr
                key={p.id}
                onClick={() => openProject(p.id)}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && openProject(p.id)}
              >
                <td>
                  <div className="project-name">
                    <span className={`project-avatar color-${i % 4}`}>
                      <Box size={23} />
                    </span>
                    <div>
                      <b>{p.name}</b>
                      <small>{p.organization_name}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="progress-number">
                    {approved}
                    <span>/ {aa.length}</span>
                  </div>
                  <div className="progress-track">
                    <i
                      style={{
                        width: `${aa.length ? (approved / aa.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </td>
                <td>
                  {badge(
                    aa.every((a) => a.status === "production")
                      ? "production"
                      : p.status,
                  )}
                </td>
                <td>
                  <span className={isLate ? "late-date" : ""}>
                    {date(p.deadline)}
                  </span>
                  {isLate && (
                    <small className="late-date">{t("overdue")}</small>
                  )}
                </td>
                <td>
                  <div className="avatars">
                    {[p.manager_id, p.designer_id, p.prepress_id]
                      .filter(Boolean)
                      .map((id, j) => (
                        <span
                          key={id}
                          title={name(id)}
                          className={`avatar av-${j}`}
                        >
                          {name(id)
                            .split(" ")
                            .map((n: string) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                      ))}
                  </div>
                </td>
                <td>
                  <ArrowUpRight size={17} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!visibleProjects.length && <div className="empty">{t("empty")}</div>}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-icon">
            <Box size={24} />
          </span>
          <b>
            Pack<span>Approve</span>
          </b>
          <button className="mobile-close icon-btn" onClick={() => MB(false)}>
            <X />
          </button>
        </div>
        <div className="workspace-label">
          <div className="company-icon">Q</div>
          <div>
            <b>QAZALPACK</b>
            <small>{t("workspace")}</small>
          </div>
          <span className="online-dot" />
        </div>
        <a href="/can-lab" className="can-lab-nav"><Box size={17}/><span>Can Studio</span><small>3D / DEMO</small><ArrowUpRight size={14}/></a>
        <div className="nav-label">{t("workspace")}</div>
        <nav>
          {nav
            .filter(([k]) =>
              production
                ? ["packages", "notifications"].includes(k)
                : client
                  ? ["home", "projects", "approval", "notifications"].includes(
                      k,
                    )
                  : k === "audit"
                    ? u.role === "admin"
                    : k === "settings"
                      ? manage
                      : k === "clients"
                        ? manage
                        : true,
            )
            .map(([k, Icon]) => (
              <button
                key={k}
                onClick={() => go(k)}
                className={view === k ? "selected" : ""}
              >
                <Icon size={18} />
                <span>{t(k)}</span>
                {k === "approval" && pending.length > 0 && (
                  <b className="nav-count">{pending.length}</b>
                )}
                {k === "notifications" &&
                  d.notifications.some((n) => !n.read_at) && (
                    <i className="unread-dot" />
                  )}
              </button>
            ))}
          {client && (
            <>
              <button
                onClick={() => {
                  go("allArtworks");
                }}
              >
                <Layers size={18} />
                {t("allArtworks")}
              </button>
              <button
                onClick={() => {
                  go("approvedVersions");
                }}
              >
                <CheckCheck size={18} />
                {t("approvedVersions")}
              </button>
              <button onClick={() => go("clientComments")}>
                <MessageSquare size={18} />
                {t("comments")}
              </button>
              <button onClick={() => go("clientHistory")}>
                <Clock3 size={18} />
                {t("history")}
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="safe-card">
            <ShieldCheck size={21} />
            <b>{t("secureTitle")}</b>
            <p>{t("secureText")}</p>
          </div>
          <button
            className="user-card"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.href = "/login?reason=session-expired";
            }}
          >
            <span className="avatar av-1">
              {u.full_name
                .split(" ")
                .map((n: string) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <b>{u.full_name}</b>
              <small>
                {t(u.role === "production" ? "productionRole" : u.role)}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {mobile && <div className="overlay" onClick={() => MB(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            aria-label="Меню"
            onClick={() => MB(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            {t("workspace")}
            <ChevronRight size={14} />
            <b>
              {t(["project", "artwork"].includes(view) ? "projects" : view)}
            </b>
          </div>
          <div className="header-actions">
            <div className="search-input">
              <Search size={17} />
              <input
                aria-label={t("search")}
                placeholder={t("search")}
                value={search}
                onChange={(e) => S(e.target.value)}
              />
              <kbd>⌕</kbd>
            </div>
            <button
              className="language"
              onClick={() => L(locale === "ru" ? "kz" : "ru")}
            >
              {locale.toUpperCase()} <span>⌄</span>
            </button>
            <button
              className="notification-btn icon-btn"
              aria-label={t("notifications")}
              onClick={() => go("notifications")}
            >
              <Bell size={19} />
              {d.notifications.some((n) => !n.read_at) && <i />}
            </button>
            <span className="header-avatar avatar av-1">
              {u.full_name.slice(0, 1)}
            </span>
          </div>
        </header>
        <main
          className={`main-content ${view === "artwork" ? "artwork-main" : ""}`}
        >
          {error && (
            <div className="alert error" role="alert">
              <AlertCircle size={18} />
              {error}
              <button onClick={() => E("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === "home" &&
            u.role === "admin" &&
            (!d.organizations.some((o) => o.kind === "manufacturer") ||
              !d.organizations.some((o) => o.kind === "client") ||
              !d.profiles.some((p) => p.role === "designer" && p.active) ||
              !d.profiles.some((p) => p.role === "prepress" && p.active) ||
              !d.projects.length) && (
              <SetupWizard
                data={d}
                locale={locale}
                onRefresh={load}
                onCreateProject={() =>
                  openModal("project.create", { entityId: undefined })
                }
              />
            )}
          {["home"].includes(view) && !production && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">QAZALPACK / {t("monitor")}</div>
                  <h1>
                    {t(
                      view === "home"
                        ? "overview"
                        : view === "projects"
                          ? client
                            ? "projects"
                            : "allProjects"
                          : view,
                    )}
                  </h1>
                  <p>{t("subtitle")}</p>
                </div>
                {manage && (
                  <button
                    className="btn primary"
                    onClick={() =>
                      openModal("project.create", { entityId: undefined })
                    }
                  >
                    <Plus size={17} />
                    {t("newProject")}
                  </button>
                )}
              </div>
              <div className="stats-grid">
                {[
                  [
                    t("activeProjects"),
                    d.projects.filter((p) => p.status === "active").length,
                    FolderKanban,
                    "blue",
                  ],
                  [t("awaiting"), pending.length, Clock3, "purple"],
                  [
                    t("approved"),
                    d.versions.filter((v) => v.status === "approved").length,
                    CheckCircle2,
                    "green",
                  ],
                  [t("overdue"), late.length, CalendarDays, "orange"],
                ].map(([label, n, Icon, color]: any, i) => (
                  <button
                    className="stat-card"
                    key={label}
                    onClick={() => {
                      F(i === 1 ? "published" : i === 2 ? "approved" : "all");
                      V("projects");
                    }}
                  >
                    <div className="stat-top">
                      <span>{label}</span>
                      <span className={`stat-icon ${color}`}>
                        <Icon size={19} />
                      </span>
                    </div>
                    <div className="stat-value">
                      {String(n).padStart(2, "0")}
                      <span>
                        {i === 0
                          ? `${d.artworks.length} ${t("artworks").toLowerCase()}`
                          : i === 1
                            ? t("allPolicy")
                            : i === 2
                              ? "SHA-256 ✓"
                              : t("deadline")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <section
                className="panel info-panel"
                style={{ marginBottom: 24 }}
              >
                <div className="panel-heading">
                  <h2>{t("nextActions")}</h2>
                  <span>{t("currentVersions")}</span>
                </div>
                {operationalItems(d)
                  .filter((i) => i.mine || i.ready)
                  .slice(0, 4)
                  .map((i) => (
                    <button
                      className="history-row clickable"
                      key={i.a.id}
                      onClick={() => openArtwork(i.a)}
                    >
                      <span>
                        <b>{i.a.name}</b> · V{i.version?.number || "—"}
                      </span>
                      <span>
                        {t(i.stage)} · {date(i.deadline)}{" "}
                        <ArrowUpRight size={14} />
                      </span>
                    </button>
                  ))}
                {!operationalItems(d).some((i) => i.mine || i.ready) && (
                  <p className="muted">{t("queueEmpty")}</p>
                )}
              </section>
              <div className="dashboard-columns">
                <section className="panel projects-panel">
                  <div className="panel-heading">
                    <h2>
                      {t("projects")}
                      <span className="count">{visibleProjects.length}</span>
                    </h2>
                    <button className="text-btn" onClick={() => go("projects")}>
                      {t("showAll")}
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <div className="table-toolbar">
                    <div className="tabs compact">
                      {["all", "active", "published", "production"].map((f) => (
                        <button
                          key={f}
                          className={filter === f ? "active-tab" : ""}
                          onClick={() => F(f)}
                        >
                          {t(f)}
                        </button>
                      ))}
                    </div>
                    <SlidersHorizontal size={17} className="muted" />
                  </div>
                  {projectTable()}
                </section>
                <aside className="panel activity-panel">
                  <div className="panel-heading">
                    <h2>{t("activity")}</h2>
                  </div>
                  <div className="activity-list">
                    {d.notifications.slice(0, 6).map((n, i) => (
                      <div className="activity-item" key={n.id}>
                        <span
                          className={`activity-icon ${i % 2 ? "purple" : "blue"}`}
                        >
                          {n.kind.startsWith("package") ? (
                            <Factory size={16} />
                          ) : n.kind.startsWith("decision") ? (
                            <Check size={16} />
                          ) : (
                            <Layers size={16} />
                          )}
                        </span>
                        <div>
                          <b>{event(n.kind)}</b>
                          <p>
                            {d.projects.find((p) => p.id === n.project_id)
                              ?.name || "PackApprove"}
                          </p>
                          <small>{date(n.created_at)}</small>
                        </div>
                      </div>
                    ))}
                    {!d.notifications.length && (
                      <div className="empty">{t("empty")}</div>
                    )}
                  </div>
                  <div className="activity-bottom">
                    <ShieldCheck size={17} />
                    {t("fileIdentity")}
                  </div>
                </aside>
              </div>
              <div className="section-heading">
                <h2>
                  {t("artworks")}{" "}
                  <span className="count">{homeArtworks.length}</span>
                </h2>
                <button className="text-btn" onClick={()=>go('allArtworks')}><Layers size={15}/>{t('allArtworks')}<ArrowUpRight size={14}/></button>
              </div>
              {renderArtworks(
                homeArtworks
                  .filter((a) =>
                    visibleProjects.some((p) => p.id === a.project_id),
                  )
                  .slice(0, view === "home" ? 4 : 99),
              )}
            </>
          )}
          {[
            "projects",
            "tasks",
            "internal",
            "approval",
            "changes",
            "ready",
          ].includes(view) && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    PACKAGING OPERATIONS / {t(view)}
                  </div>
                  <h1>{t(view === "projects" ? "allProjects" : view)}</h1>
                </div>
                {view === "projects" && manage && (
                  <button
                    className="btn primary"
                    onClick={() =>
                      openModal("project.create", { entityId: undefined })
                    }
                  >
                    <Plus size={16} />
                    {t("newProject")}
                  </button>
                )}
              </div>
              <Operations
                data={d}
                view={view}
                locale={locale}
                onArtwork={openArtwork}
                onProject={openProject}
                search={search}
                onSearch={S}
              />
            </>
          )}

          {view === "settings" && u.role === "admin" && (
            <PeopleManagement
              data={d}
              locale={locale}
              onRefresh={load}
              onInvite={() =>
                openModal("invitation.create", { entityId: undefined })
              }
            />
          )}
          {view === "project" && project && (
            <>
              <button
                className="text-btn back-btn"
                onClick={() => go("projects")}
              >
                <ArrowLeft size={16} />
                {t("back")}
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {project.organization_name} /{" "}
                    {project.customer_order || "QAZALPACK"}
                  </div>
                  <h1>{project.name}</h1>
                  <p>{project.description}</p>
                </div>
                <div className="action-group">
                  {badge(project.status)}
                  {manage && (
                    <button
                      className="btn"
                      onClick={() =>
                        openModal("project.update", {
                          entityId: project.id,
                          rowVersion: project.row_version,
                          payload: {
                            name: project.name,
                            description: project.description,
                            contacts: project.contacts,
                            customerOrder: project.customer_order,
                            deadline: project.deadline.slice(0, 10),
                            priority: project.priority,
                            status: project.status,
                            designerId: project.designer_id,
                            prepressId: project.prepress_id,
                          },
                        })
                      }
                    >
                      <Settings2 size={15} />
                      {t("settings")}
                    </button>
                  )}
                </div>
              </div>
              <div className="project-summary panel">
                <span>
                  <CalendarDays />
                  {t("deadline")}: <b>{date(project.deadline)}</b>
                </span>
                <span>
                  <Users />
                  {name(project.manager_id)}
                </span>
                <span>
                  <Box />
                  {
                    d.artworks.filter((a) => a.project_id === project.id).length
                  }{" "}
                  {t("artworks").toLowerCase()}
                </span>
              </div>
              {renderArtworks(
                d.artworks.filter((a) => a.project_id === project.id),
              )}
              <section className="panel info-panel">
                <h2>{t("contacts")}</h2>
                <p>{project.contacts || "—"}</p>
                <p>
                  {t("designer")}: {name(project.designer_id)} · {t("prepress")}
                  : {name(project.prepress_id)}
                </p>
              </section>
            </>
          )}
          {(view === "allArtworks" || view === "approvedVersions") && (
            <>
              <div className="page-heading">
                <h1>{t(view)}</h1>
              </div>
              {renderArtworks(
                d.artworks.filter(
                  (a) =>
                    view === "allArtworks" ||
                    d.versions.some(
                      (v) => v.artwork_id === a.id && v.status === "approved",
                    ),
                ),
              )}
            </>
          )}
          {view === "artwork" && artwork && (
            <>
              <WorkflowSteps data={d} artwork={artwork} locale={locale} />
              <button
                className="text-btn back-btn"
                onClick={() => openProject(artwork.project_id)}
              >
                <ArrowLeft size={16} />
                {project?.name || t("projects")}
              </button>
              <div className="page-heading artwork-heading">
                <div>
                  <div className="eyebrow">
                    {project?.organization_name} / {artwork.packaging_type}
                  </div>
                  <h1>
                    {artwork.name}{" "}
                    <span className="large-version">
                      V{selected?.number || "—"}
                    </span>
                  </h1>
                  <div className="inline-badges">
                    {badge(selected?.status || "draft")}
                    <span className="muted">
                      <LockKeyhole size={13} />
                      {t("fixed")}
                    </span>
                  </div>
                </div>
                <div className="action-group">
                  {u.role === "designer" && (
                    <button
                      className="btn primary"
                      onClick={() =>
                        openModal("version.create", {
                          entityId: artwork.id,
                          rowVersion: artwork.row_version,
                        })
                      }
                    >
                      <Plus size={16} />
                      {t("newVersion")}
                    </button>
                  )}
                  {u.role === "designer" &&
                    active &&
                    selected?.status === "fixed" && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void command("version.submit", selected.id).catch(
                            () => {},
                          )
                        }
                      >
                        <Send size={16} />
                        {t("submit")}
                      </button>
                    )}
                  {u.role === "prepress" &&
                    ["internal_review", "published", "approved"].includes(
                      selected?.status,
                    ) &&
                    !review &&
                    active && (
                      <button
                        className="btn primary"
                        onClick={() => openModal("review.complete")}
                      >
                        {t("technical")}
                      </button>
                    )}
                  {manage &&
                    active &&
                    ["internal_review", "published"].includes(
                      selected?.status,
                    ) && (
                      <button
                        className="btn primary"
                        onClick={() =>
                          openModal("round.open", {
                            organizationId: project?.organization_id,
                          })
                        }
                      >
                        <Send size={16} />
                        {t("send")}
                      </button>
                    )}
                  {manage &&
                    active &&
                    selected?.status === "approved" &&
                    !d.packages.some((p) => p.version_id === selected.id) && (
                      <button
                        className="btn primary"
                        onClick={() => openModal("package.issue")}
                      >
                        <Factory size={16} />
                        {t("issue")}
                      </button>
                    )}
                </div>
              </div>
              {!active && selected && (
                <div className="alert warning">
                  {t("stale")}
                  <button
                    className="text-btn"
                    onClick={() => VI(artwork.active_version_id)}
                  >
                    {t("latest")}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <div className="version-strip">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    className={selected?.id === v.id ? "selected" : ""}
                    onClick={() => {
                      VI(v.id);
                      PG(1);
                    }}
                  >
                    <Layers size={14} />
                    <b>V{v.number}</b>
                    <span>{date(v.created_at)}</span>
                    {v.status === "approved" && <Check size={14} />}
                  </button>
                ))}
                <button
                  className="text-btn compare-toggle"
                  disabled={versions.length < 2}
                  onClick={() => {
                    MODE(compare ? "2d" : "compare");
                    C(!compare);
                    CI(versions.find((v) => v.id !== selected?.id)?.id || "");
                  }}
                >
                  <ScanLine size={16} />
                  {t("compare")}
                </button>
              </div>
              <StudioTabs.Root
                value={previewMode}
                onValueChange={(value) => {
                  MODE(value);
                  C(value === "compare");
                  if (value === "compare")
                    CI(versions.find((v) => v.id !== selected?.id)?.id || "");
                }}
                className="studio-mode-tabs"
              >
                <StudioTabs.List
                  aria-label={
                    locale === "ru" ? "Режим просмотра" : "Қарау режимі"
                  }
                >
                  <StudioTabs.Trigger value="2d">
                    {locale === "ru" ? "2D-развёртка" : "2D жайма"}
                  </StudioTabs.Trigger>
                  <StudioTabs.Trigger value="3d">
                    {locale === "ru" ? "3D-банка" : "3D құты"}
                  </StudioTabs.Trigger>
                  <StudioTabs.Trigger
                    value="compare"
                    disabled={versions.length < 2}
                  >
                    {t("compare")}
                  </StudioTabs.Trigger>
                </StudioTabs.List>
              </StudioTabs.Root>
              <div
                className={`studio ${previewMode === "3d" ? "studio-with-can" : ""}`}
              >
                {previewMode === "3d" && selected ? (
                  <CanStudio
                    key={selected.id}
                    file={preview}
                    version={selected}
                    versions={versions}
                    savedSpec={
                      d.visualizations?.find(
                        (v) => v.version_id === selected.id,
                      )?.spec
                    }
                    role={u.role}
                    locale={locale}
                    onVersion={(id) => {
                      VI(id);
                      PG(1);
                    }}
                    onPageChange={PG}
                    onFallback={() => MODE("2d")}
                    onNewVersion={(file, spec) =>
                      openModal("version.create", {
                        entityId: artwork.id,
                        rowVersion: artwork.row_version,
                        presetFile: file,
                        payload: { canSpec: spec },
                      })
                    }
                  />
                ) : (
                  <section className="viewer-section">
                    <div className="viewer-toolbar">
                      <span>
                        <FileText size={16} />
                        {preview?.filename || t("preview")}
                      </span>
                      <div>
                        <button
                          className="icon-btn"
                          aria-label={t("zoom")}
                          onClick={() => Z(Math.max(0.3, zoom - 0.15))}
                        >
                          <ZoomOut size={17} />
                        </button>
                        <b>{Math.round(zoom * 100)}%</b>
                        <button
                          className="icon-btn"
                          aria-label={t("zoom")}
                          onClick={() => Z(Math.min(3, zoom + 0.15))}
                        >
                          <ZoomIn size={17} />
                        </button>
                        <span className="divider" />
                        <button
                          className="icon-btn"
                          aria-label={t("fullscreen")}
                          onClick={() =>
                            void document
                              .querySelector(".preview-stage")
                              ?.requestFullscreen()
                          }
                        >
                          <Maximize2 size={17} />
                        </button>
                      </div>
                    </div>
                    {compare && (
                      <div className="compare-selector">
                        <span>
                          {t("compare")}: V{selected?.number}
                        </span>
                        <select
                          value={compareId}
                          onChange={(e) => CI(e.target.value)}
                        >
                          {versions
                            .filter((v) => v.id !== selected?.id)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                V{v.number} — {v.changes}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div
                      className={`preview-stage ${compare ? "compare-stage" : ""}`}
                    >
                      <div className="preview-scroll">
                        <div
                          className="preview-document"
                          onClick={(e) => {
                            if (!selected || compare) return;
                            const r = e.currentTarget.getBoundingClientRect();
                            openModal("comment.create", {
                              payload: {
                                x: (e.clientX - r.left) / r.width,
                                y: (e.clientY - r.top) / r.height,
                                page,
                                visibility: "client",
                              },
                              entityId: selected.id,
                            });
                          }}
                        >
                          {preview ? (
                            preview.mime_type === "application/pdf" ? (
                              <PdfViewer
                                url={`/api/files/${preview.id}?view=1`}
                                zoom={zoom}
                                page={page}
                                onPages={PGS}
                              />
                            ) : (
                              <img
                                src={`/api/files/${preview.id}?view=1`}
                                alt={artwork.name}
                                style={{ width: 600 * zoom, maxWidth: "none" }}
                              />
                            )
                          ) : (
                            <div className="empty">
                              <UploadCloud size={44} />
                              {t("noPreview")}
                            </div>
                          )}
                          {threads
                            .filter((th) => th.page === page)
                            .map((th, i) => (
                              <span
                                key={th.id}
                                className={`comment-pin ${th.status === "resolved" ? "resolved-pin" : ""}`}
                                style={{
                                  left: `${th.x * 100}%`,
                                  top: `${th.y * 100}%`,
                                }}
                                title={
                                  d.comments.find((c) => c.thread_id === th.id)
                                    ?.body
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  document
                                    .getElementById(`thread-${th.id}`)
                                    ?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "nearest",
                                    });
                                }}
                              >
                                {i + 1}
                              </span>
                            ))}
                        </div>
                      </div>
                      {compare && (
                        <div className="preview-scroll">
                          {(() => {
                            const f = d.files.find(
                              (f) =>
                                f.version_id === compareId &&
                                f.kind === "preview",
                            );
                            return f ? (
                              f.mime_type === "application/pdf" ? (
                                <PdfViewer
                                  url={`/api/files/${f.id}?view=1`}
                                  zoom={zoom}
                                  page={page}
                                />
                              ) : (
                                <img
                                  src={`/api/files/${f.id}?view=1`}
                                  alt={t("compare")}
                                  style={{
                                    width: 600 * zoom,
                                    maxWidth: "none",
                                  }}
                                />
                              )
                            ) : null;
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="viewer-footer">
                      <span>
                        <MessageSquare size={14} />
                        {t("commentHint")}
                      </span>
                      <div>
                        <button
                          className="icon-btn"
                          disabled={page <= 1}
                          onClick={() => PG(page - 1)}
                        >
                          <ArrowLeft size={14} />
                        </button>
                        {t("page")} {page} / {pages}
                        <button
                          className="icon-btn"
                          disabled={page >= pages}
                          onClick={() => PG(page + 1)}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="files-panel">
                      <div className="panel-heading">
                        <h3>{t("files")}</h3>
                        <LockKeyhole size={14} />
                      </div>
                      {files.map((f) => (
                        <a
                          className="file-row"
                          key={f.id}
                          href={`/api/files/${f.id}`}
                        >
                          <span className="pdf-icon">
                            <FileText size={19} />
                          </span>
                          <div>
                            <b>{f.filename}</b>
                            <small>
                              {t(
                                f.kind === "production"
                                  ? "productionFile"
                                  : f.kind,
                              )}{" "}
                              · {(f.size / 1024).toFixed(1)} KB · SHA-256{" "}
                              {f.sha256.slice(0, 12)}…
                            </small>
                          </div>
                          <Download size={16} />
                        </a>
                      ))}
                      <div className="change-log">
                        <b>{t("changeLog")}</b>
                        <p>{selected?.changes || "—"}</p>
                      </div>
                    </div>
                  </section>
                )}
                <aside className="studio-panel">
                  <div className="tabs studio-tabs">
                    {["comments", "clientApproval", "technical", "brief"]
                      .filter((k) => k !== "technical" || staff)
                      .map((k) => (
                        <button
                          key={k}
                          className={tab === k ? "active-tab" : ""}
                          onClick={() => T(k)}
                        >
                          {t(k)}
                          {k === "comments" && <small>{threads.length}</small>}
                        </button>
                      ))}
                  </div>
                  {tab === "comments" && (
                    <>
                      <div className="comment-panel-heading">
                        <b>
                          {t("comments")}{" "}
                          <span className="count">{threads.length}</span>
                        </b>
                        <button
                          className="icon-btn"
                          disabled={!selected}
                          onClick={() =>
                            openModal("comment.create", {
                              payload: {
                                x: 0.5,
                                y: 0.5,
                                page,
                                visibility: "client",
                              },
                            })
                          }
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <div className="threads">
                        {threads.map((th, i) => (
                          <article
                            className="comment-thread"
                            id={`thread-${th.id}`}
                            key={th.id}
                          >
                            <div className="thread-head">
                              <span className="comment-number">{i + 1}</span>
                              <b>{name(th.author_id)}</b>
                              <small>{date(th.created_at)}</small>
                            </div>
                            <div className="thread-tags">
                              <span
                                className={
                                  th.visibility === "internal"
                                    ? "internal-tag"
                                    : "client-tag"
                                }
                              >
                                {th.visibility === "internal" ? (
                                  <LockKeyhole size={11} />
                                ) : (
                                  <Users size={11} />
                                )}{" "}
                                {t(
                                  th.visibility === "internal"
                                    ? "internalComment"
                                    : "clientComment",
                                )}
                              </span>
                              <small>
                                {t("page")} {th.page}
                              </small>
                              {th.carried_from_id && (
                                <small>{t("carried")}</small>
                              )}
                              {th.status === "resolved" && (
                                <CheckCircle2
                                  size={13}
                                  className="green-text"
                                />
                              )}
                            </div>
                            {d.comments
                              .filter((c) => c.thread_id === th.id)
                              .map((c, j) => (
                                <div
                                  className={j ? "reply" : "comment-body"}
                                  key={c.id}
                                >
                                  {j > 0 && <b>{name(c.author_id)}</b>}
                                  <p>{c.body}</p>
                                </div>
                              ))}
                            <div className="thread-actions">
                              <button
                                onClick={() =>
                                  openModal("comment.reply", {
                                    entityId: th.id,
                                  })
                                }
                              >
                                {t("reply")}
                              </button>
                              {["designer", "manager", "admin"].includes(
                                u.role,
                              ) &&
                                th.status === "open" &&
                                versions.some(
                                  (v) => v.number > selected!.number,
                                ) && (
                                  <button
                                    onClick={() =>
                                      openModal("comment.resolve", {
                                        entityId: th.id,
                                        versions: versions.filter(
                                          (v) => v.number > selected!.number,
                                        ),
                                      })
                                    }
                                  >
                                    <Check size={12} />
                                    {t("resolve")}
                                  </button>
                                )}
                              {["designer", "manager", "admin"].includes(
                                u.role,
                              ) &&
                                th.status === "open" &&
                                versions.some(
                                  (v) => v.number > selected!.number,
                                ) && (
                                  <button
                                    onClick={() =>
                                      openModal("comment.carry", {
                                        entityId: th.id,
                                        versions: versions.filter(
                                          (v) => v.number > selected!.number,
                                        ),
                                      })
                                    }
                                  >
                                    {t("carry")}
                                  </button>
                                )}
                            </div>
                          </article>
                        ))}
                        {!threads.length && (
                          <div className="empty">
                            <MessageSquare />
                            {t("commentHint")}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {tab === "clientApproval" && (
                    <div className="detail-panel">
                      <h3>{t("clientApproval")}</h3>
                      <p className="muted">{t("allPolicy")}</p>
                      {round ? (
                        <>
                          {badge(round.status)}
                          <p>
                            {t("deadline")}: {date(round.deadline)}
                          </p>
                          {d.participants
                            .filter((p) => p.round_id === round.id)
                            .map((p) => {
                              const dec = d.decisions.find(
                                (x) =>
                                  x.round_id === round.id &&
                                  x.user_id === p.user_id,
                              );
                              return (
                                <div className="participant" key={p.id}>
                                  <span className="avatar av-1">
                                    {name(p.user_id).slice(0, 1)}
                                  </span>
                                  <div>
                                    <b>{name(p.user_id)}</b>
                                    <small>{t(p.kind)}</small>
                                  </div>
                                  {dec ? (
                                    badge(dec.result)
                                  ) : (
                                    <Clock3 size={17} className="muted" />
                                  )}
                                </div>
                              );
                            })}
                          {d.decisions
                            .filter((x) => x.round_id === round.id)
                            .map((dec) => (
                              <div className="decision-record" key={dec.id}>
                                <LockKeyhole size={14} />
                                <b>{name(dec.user_id)}</b>
                                <p>{dec.comment}</p>
                                <code>SHA-256 {dec.sha256}</code>
                                <small>{date(dec.created_at)}</small>
                              </div>
                            ))}
                          {u.role === "approver" &&
                            active &&
                            round.status === "open" &&
                            !meDecision &&
                            d.participants.some(
                              (p) =>
                                p.round_id === round.id &&
                                p.user_id === u.id &&
                                p.kind === "approver",
                            ) && (
                              <div className="decision-actions">
                                <button
                                  className="btn primary wide"
                                  onClick={() =>
                                    openModal("decision.create", {
                                      entityId: round.id,
                                      payload: { result: "approved" },
                                    })
                                  }
                                >
                                  <Check size={16} />
                                  {t("approve")}
                                </button>
                                <button
                                  className="btn wide"
                                  onClick={() =>
                                    openModal("decision.create", {
                                      entityId: round.id,
                                      payload: { result: "changes_requested" },
                                    })
                                  }
                                >
                                  <RotateCcw size={16} />
                                  {t("requestChanges")}
                                </button>
                              </div>
                            )}
                        </>
                      ) : (
                        <p>{t("noRound")}</p>
                      )}
                      <h3>{t("history")}</h3>
                      {d.rounds
                        .filter((r) => r.artwork_id === artwork.id)
                        .map((r) => (
                          <div className="history-row" key={r.id}>
                            <span>
                              V
                              {
                                d.versions.find((v) => v.id === r.version_id)
                                  ?.number
                              }{" "}
                              · {date(r.created_at)}
                            </span>
                            {badge(r.status)}
                          </div>
                        ))}
                    </div>
                  )}
                  {tab === "technical" && (
                    <div className="detail-panel">
                      <h3>{t("technical")}</h3>
                      {review ? (
                        <>
                          <span
                            className={`badge ${review.status === "ready" ? "approved" : "changes_requested"}`}
                          >
                            {t(
                              review.status === "ready"
                                ? "readyCheck"
                                : review.status === "limited"
                                  ? "limitedCheck"
                                  : "correctionCheck",
                            )}
                          </span>
                          <p>
                            {name(review.reviewer_id)} ·{" "}
                            {date(review.created_at)}
                          </p>
                          {d.reviewItems
                            .filter((i) => i.review_id === review.id)
                            .map((i) => (
                              <div className="checklist-line" key={i.id}>
                                {i.passed ? (
                                  <CheckCircle2
                                    size={17}
                                    className="green-text"
                                  />
                                ) : (
                                  <X size={17} className="late-date" />
                                )}
                                {i.label}
                              </div>
                            ))}
                          <p>{review.notes}</p>
                        </>
                      ) : (
                        <p>{t("noReview")}</p>
                      )}
                    </div>
                  )}
                  {tab === "brief" && (
                    <div className="detail-panel">
                      <div className="panel-heading">
                        <h3>{t("brief")}</h3>
                        {manage && (
                          <button
                            className="text-btn"
                            onClick={() =>
                              openModal("brief.save", {
                                entityId: artwork.id,
                                rowVersion: artwork.row_version,
                                brief: d.briefs.find(
                                  (b) => b.artwork_id === artwork.id,
                                )?.content,
                              })
                            }
                          >
                            {t("editBrief")}
                          </button>
                        )}
                      </div>
                      {d.briefs
                        .filter((b) => b.artwork_id === artwork.id)
                        .map((b, i) => (
                          <details key={b.id} open={i === 0}>
                            <summary>
                              V{b.number} · {date(b.created_at)}
                            </summary>
                            <dl className="brief-list">
                              {Object.entries(b.content).map(([k, v]) => (
                                <div key={k}>
                                  <dt>
                                    {t(
                                      k === "printing"
                                        ? "print"
                                        : k === "comments"
                                          ? "commentsBrief"
                                          : k,
                                    )}
                                  </dt>
                                  <dd>
                                    {Array.isArray(v)
                                      ? v.join(", ")
                                      : String(v) || "—"}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        ))}
                    </div>
                  )}
                </aside>
              </div>
            </>
          )}
          {(view === "packages" || (production && view === "home")) && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">QAZALPACK / PRODUCTION</div>
                  <h1>{t("packages")}</h1>
                  <p>{t("productionNote")}</p>
                </div>
                <span className="stat-icon blue">
                  <Factory />
                </span>
              </div>
              <div className="tabs package-tabs">
                {["all", "transferred", "received", "revoked"].map((f) => (
                  <button
                    key={f}
                    className={filter === f ? "active-tab" : ""}
                    onClick={() => F(f)}
                  >
                    {t(f)}
                  </button>
                ))}
              </div>
              <div className="package-grid">
                {d.packages
                  .filter(
                    (p) =>
                      !["transferred", "received", "revoked"].includes(
                        filter,
                      ) || p.status === filter,
                  )
                  .map((p) => {
                    const a = d.artworks.find((a) => a.id === p.artwork_id);
                    const v = d.versions.find((v) => v.id === p.version_id);
                    const f = d.files.find((f) => f.id === p.file_id);
                    return (
                      <section
                        className={`panel package-card ${p.status === "revoked" ? "revoked-card" : ""}`}
                        key={p.id}
                      >
                        <div className="panel-heading">
                          <span className="package-number">
                            <Box size={21} />
                            {p.number}
                          </span>
                          {badge(p.status)}
                        </div>
                        <h2>{a?.name || f?.filename || p.number}</h2>
                        <div className="muted">
                          {d.projects.find((pr) => pr.id === p.project_id)
                            ?.name || t("productionRole")}{" "}
                          <span className="version-chip inline">
                            V{v?.number || "✓"}
                          </span>
                        </div>
                        <div className="package-proof">
                          <div>
                            <CheckCircle2 size={15} />
                            {t("clientApproval")}
                          </div>
                          <div>
                            <CheckCircle2 size={15} />
                            {t("technicalPassed")}
                          </div>
                        </div>
                        <label className="checksum">
                          {t("checksum")}
                          <code>{p.sha256}</code>
                        </label>
                        <small className="muted">
                          {t("transferred")}: {date(p.created_at)}
                        </small>
                        {d.revocations
                          .filter((r) => r.package_id === p.id)
                          .map((r) => (
                            <p className="late-date" key={r.id}>
                              {t("reason")}: {r.reason}
                            </p>
                          ))}
                        <div className="package-actions">
                          {["transferred", "received"].includes(p.status) && (
                            <>
                              <a
                                href={`/api/packages/${p.id}`}
                                className="btn primary"
                              >
                                <Download size={16} />
                                {t("download")}
                              </a>
                              {production && p.status === "transferred" && (
                                <button
                                  className="btn"
                                  onClick={() =>
                                    openModal("package.ack", {
                                      entityId: p.id,
                                      rowVersion: p.row_version,
                                      checksum: p.sha256,
                                    })
                                  }
                                >
                                  <Check size={16} />
                                  {t("ack")}
                                </button>
                              )}
                              {manage && (
                                <button
                                  className="btn danger"
                                  onClick={() =>
                                    openModal("package.revoke", {
                                      entityId: p.id,
                                      rowVersion: p.row_version,
                                    })
                                  }
                                >
                                  <RotateCcw size={15} />
                                  {t("revoke")}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        <details>
                          <summary>{t("history")}</summary>
                          {d.downloads
                            .filter((e) => e.package_id === p.id)
                            .map((e) => (
                              <p key={e.id}>
                                {t("download")} · {name(e.user_id)} ·{" "}
                                {date(e.created_at)}
                              </p>
                            ))}
                          {d.acknowledgements
                            .filter((e) => e.package_id === p.id)
                            .map((e) => (
                              <p key={e.id}>
                                {t("received")} · {name(e.user_id)} ·{" "}
                                {date(e.created_at)}
                              </p>
                            ))}
                        </details>
                      </section>
                    );
                  })}
              </div>
              {!d.packages.length && (
                <div className="empty panel">{t("empty")}</div>
              )}
            </>
          )}
          {view === "clients" && manage && (
            <>
              <div className="page-heading">
                <h1>{t("clients")}</h1>
                <div className="action-group">
                  <button
                    className="btn"
                    onClick={() =>
                      openModal("invitation.create", { entityId: undefined })
                    }
                  >
                    <Users size={17} />
                    {t("invite")}
                  </button>
                  <button
                    className="btn primary"
                    onClick={() =>
                      openModal("organization.create", { entityId: undefined })
                    }
                  >
                    <Plus size={17} />
                    {t("addClient")}
                  </button>
                </div>
              </div>
              <div className="client-grid">
                {d.organizations
                  .filter((o) => o.kind === "client")
                  .map((o, i) => (
                    <section className="panel client-card" key={o.id}>
                      <span className={`project-avatar color-${i % 4}`}>
                        <Building2 />
                      </span>
                      <h2>{o.name}</h2>
                      <p>
                        {
                          d.projects.filter((p) => p.organization_id === o.id)
                            .length
                        }{" "}
                        {t("projects").toLowerCase()}
                      </p>
                      {d.memberships
                        .filter((m) => m.organization_id === o.id)
                        .map((m) => (
                          <div className="client-person" key={m.id}>
                            <Users size={15} />
                            {name(m.user_id)}
                          </div>
                        ))}
                    </section>
                  ))}
              </div>
              <section className="panel info-panel">
                <h2>{t("invite")}</h2>
                {d.invitations.map((i) => (
                  <div className="history-row" key={i.id}>
                    <span>{i.email}</span>
                    <small>
                      {t(i.role)} · {date(i.created_at)}
                    </small>
                  </div>
                ))}
              </section>
            </>
          )}
          {view === "notifications" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>{t("notifications")}</h1>
                  <p>{t("notificationInfo")}</p>
                </div>
                <span className="count">
                  {d.notifications.filter((n) => !n.read_at).length}{" "}
                  {t("unread")}
                </span>
              </div>
              <section className="panel notification-list">
                {d.notifications.map((n) => (
                  <article className={n.read_at ? "" : "unread"} key={n.id}>
                    <span className="activity-icon blue">
                      <Bell size={18} />
                    </span>
                    <div>
                      <b>{event(n.kind)}</b>
                      <p>
                        {d.projects.find((p) => p.id === n.project_id)?.name}
                      </p>
                      <small>
                        {new Date(n.created_at).toLocaleString(
                          locale === "ru" ? "ru-RU" : "kk-KZ",
                        )}
                      </small>
                    </div>
                    {!n.read_at && (
                      <button
                        className="icon-btn"
                        title={t("read")}
                        disabled={busy}
                        onClick={() =>
                          void command("notification.read", n.id).catch(
                            () => {},
                          )
                        }
                      >
                        <Check size={18} />
                      </button>
                    )}
                  </article>
                ))}
                {!d.notifications.length && (
                  <div className="empty">{t("empty")}</div>
                )}
              </section>
            </>
          )}
          {view === "reports" && staff && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">QAZALPACK / ANALYTICS</div>
                  <h1>{t("reports")}</h1>
                  <p>{t("reportDuration")}</p>
                </div>
                <ChartNoAxesCombined size={30} className="muted" />
              </div>
              <div className="stats-grid">
                {[
                  [
                    t("reportDuration"),
                    (() => {
                      const rr = d.rounds.filter(
                        (r) =>
                          ["approved", "changes_requested"].includes(
                            r.status,
                          ) && r.closed_at,
                      );
                      return (
                        (
                          rr.reduce(
                            (s, r) =>
                              s +
                              (+new Date(r.closed_at) -
                                +new Date(r.created_at)) /
                                3600000,
                            0,
                          ) / (rr.length || 1)
                        ).toFixed(1) +
                        " " +
                        t("hours")
                      );
                    })(),
                  ],
                  [t("roundCount"), d.rounds.length],
                  [t("versionCount"), d.versions.length],
                  [
                    t("pendingReceive"),
                    d.packages.filter((p) => p.status === "transferred").length,
                  ],
                ].map(([l, v]) => (
                  <div className="stat-card" key={l as string}>
                    <span>{l}</span>
                    <strong className="stat-value">{v}</strong>
                  </div>
                ))}
              </div>
              <div className="report-grid">
                <section className="panel info-panel">
                  <h2>{t("workload")}</h2>
                  {d.profiles
                    .filter((p) => p.role === "designer")
                    .map((p) => (
                      <div className="report-line" key={p.id}>
                        <span>{p.full_name}</span>
                        <div className="bar-track">
                          <i
                            style={{
                              width: `${Math.min(100, d.projects.filter((pr) => pr.designer_id === p.id).length * 15)}%`,
                            }}
                          />
                        </div>
                        <b>
                          {
                            d.projects.filter((pr) => pr.designer_id === p.id)
                              .length
                          }
                        </b>
                      </div>
                    ))}
                </section>
                <section className="panel info-panel">
                  <h2>{t("lateClients")}</h2>
                  {d.organizations
                    .filter((o) => o.kind === "client")
                    .map((o) => (
                      <div className="history-row" key={o.id}>
                        <span>{o.name}</span>
                        <b>
                          {
                            late.filter((r) =>
                              d.artworks.some(
                                (a) =>
                                  a.id === r.artwork_id &&
                                  d.projects.some(
                                    (p) =>
                                      p.id === a.project_id &&
                                      p.organization_id === o.id,
                                  ),
                              ),
                            ).length
                          }
                        </b>
                      </div>
                    ))}
                </section>
                <section className="panel info-panel">
                  <h2>{t("roundCount")}</h2>
                  {[
                    "approved",
                    "changes_requested",
                    "superseded",
                    "cancelled",
                    "open",
                  ].map((s) => (
                    <div className="history-row" key={s}>
                      {badge(s)}
                      <b>{d.rounds.filter((r) => r.status === s).length}</b>
                    </div>
                  ))}
                </section>
                <section className="panel info-panel">
                  <h2>{t("history")}</h2>
                  {d.packages.map((p) => (
                    <div className="history-row" key={p.id}>
                      <span>{p.number}</span>
                      {badge(p.status)}
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
          {view === "settings" && manage && (
            <>
              <div className="page-heading">
                <h1>{t("settings")}</h1>
                <ShieldCheck size={28} />
              </div>
              <section className="panel info-panel">
                <h2>{t("company")}</h2>
                <p>{t("brand")}</p>
              </section>
              <section className="panel info-panel">
                <h2>{t("people")}</h2>
                {d.profiles.map((p) => (
                  <div className="history-row" key={p.id}>
                    <span>
                      <b>{p.full_name}</b>
                      <small>
                        {" "}
                        ·{" "}
                        {t(p.role === "production" ? "productionRole" : p.role)}
                      </small>
                    </span>
                    {u.role === "admin" && p.id !== u.id && (
                      <button
                        className="text-btn"
                        onClick={() =>
                          openModal("profile.update", {
                            entityId: p.id,
                            rowVersion: p.row_version,
                            profile: p,
                          })
                        }
                      >
                        {t("security")}
                      </button>
                    )}
                  </div>
                ))}
              </section>
              <section className="panel info-panel">
                <div className="panel-heading">
                  <h2>{t("template")}</h2>
                  {u.role === "admin" && (
                    <button
                      className="btn"
                      onClick={() =>
                        openModal("template.create", { entityId: undefined })
                      }
                    >
                      <Plus size={15} />
                      {t("add")}
                    </button>
                  )}
                </div>
                {d.templates.map((tp) => (
                  <details key={tp.id}>
                    <summary>
                      {tp.name} · V{tp.number}
                    </summary>
                    {tp.items.map((i: string) => (
                      <div key={i} className="checklist-line">
                        <Check size={15} />
                        {i}
                      </div>
                    ))}
                  </details>
                ))}
              </section>
            </>
          )}
          {view === "audit" && u.role === "admin" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>{t("audit")}</h1>
                  <p>{t("fixed")}</p>
                </div>
                <LockKeyhole size={25} />
              </div>
              <section className="panel">
                <div className="project-table-wrap">
                  <table className="project-table">
                    <thead>
                      <tr>
                        <th>{t("date")}</th>
                        <th>{t("user")}</th>
                        <th>{t("action")}</th>
                        <th>ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.audit.map((a) => (
                        <tr key={a.id}>
                          <td>{date(a.created_at)}</td>
                          <td>{name(a.actor_id)}</td>
                          <td>{event(a.action)}</td>
                          <td>
                            <code>{a.entity_id?.slice(0, 12)}…</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {(view === "clientComments" || view === "clientHistory") && (
            <>
              <div className="page-heading">
                <h1>{t(view === "clientComments" ? "comments" : "history")}</h1>
              </div>
              <section className="panel info-panel">
                {view === "clientComments"
                  ? d.threads.map((th) => (
                      <button
                        className="history-row clickable"
                        key={th.id}
                        onClick={() => {
                          const a = d.artworks.find((a) =>
                            d.versions.some(
                              (v) =>
                                v.id === th.version_id && v.artwork_id === a.id,
                            ),
                          );
                          if (a) {
                            openArtwork(a);
                            VI(th.version_id);
                          }
                        }}
                      >
                        <MessageSquare size={18} />
                        <span>
                          {d.comments.find((c) => c.thread_id === th.id)?.body}
                        </span>
                        {badge(th.status)}
                      </button>
                    ))
                  : d.rounds.map((r) => (
                      <div className="history-row" key={r.id}>
                        <span>
                          {d.artworks.find((a) => a.id === r.artwork_id)?.name}{" "}
                          · V
                          {
                            d.versions.find((v) => v.id === r.version_id)
                              ?.number
                          }
                        </span>
                        {badge(r.status)}
                        <small>{date(r.created_at)}</small>
                      </div>
                    ))}
              </section>
            </>
          )}
          <footer className="app-footer">
            <span>© 2026 QAZALPACK</span>
            <span>
              <span className="online-dot" /> PackApprove · {t("secureTitle")}
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <ActionModal
          modal={modal}
          data={d}
          locale={locale}
          busy={busy}
          error={error}
          onClose={() => {
            M(null);
            E("");
          }}
          onSubmit={command}
        />
      )}
    </div>
  );
}
