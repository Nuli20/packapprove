"use client";
import { DemoWorkspaceBar } from "./demo-entry";
import { useEffect, useState, useRef } from "react";
import {
  Box,
  RotateCcw,
  Factory,
  Building2,
  Bell,
  Settings2,
  ShieldCheck,
  Plus,
  ArrowLeft,
  ArrowRight,
  Download,
  Check,
  X,
  MessageSquare,
  LockKeyhole,
  Loader2,
  CalendarDays,
  Users,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { translate, eventKeys, type Locale } from "@/lib/i18n";
import dynamic from "next/dynamic";
const ActionModal = dynamic(() => import("./action-modal"), { ssr: false });
const ArtworkWorkspace = dynamic(
  () => import("./workspace/artwork-workspace"),
  { ssr: false, loading: () => <div className="empty">Загрузка макета…</div> },
);
import SetupWizard from "./setup-wizard";
import Dashboard from "./workspace/dashboard";
import WorkspaceChrome from "./workspace/chrome";
import { notifySessionChange } from "@/lib/session-events";
import Reports from "./workspace/reports";
import type { CatalogFilters } from "./workspace/project-catalog";
import PeopleManagement from "./people-management";

import { FileCover } from "./workspace/file-cover";
const Operations = dynamic(() => import("./operations"));
import { readWorkspaceRoute, workspaceRequest } from "@/lib/workspace-route";
import { useWorkspaceData } from "./workspace/use-workspace-data";
import { commandTransport } from "@/lib/command-request";
import type { Row, WorkspaceState as State } from "@/lib/models";
export type { Row, WorkspaceState as State } from "@/lib/models";
const initialRoute = () =>
  readWorkspaceRoute(typeof location === "undefined" ? "" : location.search);
export default function Workspace() {
  const [locale, L] = useState<Locale>("ru");
  const t = (k: string) => translate(locale, k);
  const [view, V] = useState(() => initialRoute().view);
  const [projectId, PI] = useState(() => initialRoute().project);
  const [artworkId, AI] = useState(() => initialRoute().artwork);
  const [versionId, VI] = useState(() => initialRoute().version);
  const [search, S] = useState(() => initialRoute().search);
  const [filter, F] = useState("all");
  const [modal, M] = useState<Row | null>(null);
  const [busy, B] = useState(false);
  const [previewChoice, MODE] = useState(() => initialRoute().mode);
  const [catalogPage, CP] = useState(() => initialRoute().page);
  const [requestSearch, RS] = useState(() => initialRoute().search);
  const [catalogFilters, CF] = useState<CatalogFilters>({
    organization: "",
    status: "",
    sort: "deadline",
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      RS(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const [compareId, CI] = useState("");
  const requestUrl =
    workspaceRequest(
      view,
      projectId,
      artworkId,
      versionId,
      compareId,
      catalogPage,
      requestSearch,
    ) +
    (view === "projects"
      ? "&" +
        new URLSearchParams(
          Object.entries(catalogFilters).filter(([, value]) => value !== ""),
        )
      : "");
  const {
    data,
    setData: D,
    error,
    setError: E,
    loading,
    refresh: load,
    clear: clearData,
  } = useWorkspaceData(requestUrl);
  const transport = useRef<ReturnType<typeof commandTransport> | null>(null);
  if (!transport.current) transport.current = commandTransport();
  useEffect(() => {
    const loc = localStorage.getItem("pa_locale");
    if (loc === "kz") L(loc);
    const restore = () => {
      const r = readWorkspaceRoute(location.search);
      AI(r.artwork);
      PI(r.project);
      VI(r.version);
      V(r.view);
      MODE(r.mode);
      CP(r.page);
      CI("");
      S(r.search);
      RS(r.search);
      F("all");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
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
      const j = await transport.current!(action, entityId, payload, rowVersion);
      await load().catch(() =>
        E(
          locale === "ru"
            ? "Изменения сохранены, но данные не обновились. Обновите страницу."
            : "Өзгерістер сақталды. Деректерді жаңарту үшін бетті қайта жүктеңіз.",
        ),
      );
      if (action === "project.create") openProject(j.id);
      if (action === "version.create") selectVersion(j.id);
      if (action === "artwork.create")
        openArtwork({ id: j.id, project_id: entityId });
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
    AI("");
    CP(1);
    V("project");
    history.pushState(null, "", `/?project=${id}`);
  }
  function openArtwork(a: Row, selectedVersion = "") {
    AI(a.id);
    PI(a.project_id);
    VI(selectedVersion);
    V("artwork");
    CI("");
    MODE("auto");
    CP(1);
    history.pushState(
      null,
      "",
      `/?artwork=${a.id}${selectedVersion ? "&version=" + selectedVersion : ""}`,
    );
  }
  function go(v: string) {
    V(v);
    CP(1);
    S("");
    RS("");
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
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="btn" onClick={() => void load().catch(() => {})}>
              {locale === "ru" ? "Повторить" : "Қайталау"}
            </button>
            <a className="text-btn" href="/?view=projects">
              {locale === "ru" ? "К проектам" : "Жобаларға"}
            </a>
          </>
        ) : (
          <Loader2 className="spin" />
        )}
      </div>
    );
  const d = data;
  const u = d.user;
  const staff = ["admin", "manager", "designer", "prepress"].includes(u.role);
  const manage = ["admin", "manager"].includes(u.role);
  const production = u.role === "production";
  const name = (id?: string) =>
    d.profiles.find((p) => p.id === id)?.full_name || t("user");
  const date = (v?: string) =>
    v
      ? new Date(v).toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ", {
          day: "numeric",
          month: "short",
        })
      : "—";
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
  const openModal = async (action: string, extra: Row = {}) => {
    E("");
    try {
      if (
        ["project.create", "project.update", "invitation.create"].includes(
          action,
        )
      ) {
        const r = await fetch("/api/state?view=setup", { cache: "no-store" });
        if (r.status === 401) {
          location.assign("/login?reason=session-expired");
          return;
        }
        const context = await r.json();
        if (!r.ok) throw Error(context.error);
        D((old) =>
          old
            ? {
                ...old,
                organizations: context.organizations,
                profiles: context.profiles,
                memberships: context.memberships,
                templates: context.templates,
              }
            : old,
        );
      }
      M({ action, ...extra });
    } catch (e) {
      E((e as Error).message);
    }
  };
  const selectVersion = (id: string) => {
    VI(id);
    CP(1);
    const q = new URLSearchParams(location.search);
    q.set("version", id);
    q.delete("page");
    history.pushState(null, "", "/?" + q);
  };
  const changeSearch = (value: string) => {
    S(value);
    CP(1);
    const params = new URLSearchParams(location.search);
    if (value) params.set("q", value);
    else params.delete("q");
    params.delete("page");
    history.replaceState(null, "", "/?" + params);
  };
  const changeFilters = (value: CatalogFilters) => {
    CF(value);
    CP(1);
  };
  const changeCatalogPage = (value: number) => {
    CP(value);
    const q = new URLSearchParams(location.search);
    q.set("page", String(value));
    history.pushState(null, "", "/?" + q);
  };
  const renderArtworks = (items: Row[]) => (
    <div className="artwork-grid">
      {items.length ? (
        items.map((a, i) => {
          const v = d.versions.find(
            (v) => v.id === (a._display_version_id || a.active_version_id),
          );
          return (
            <button
              className="artwork-card"
              key={a._display_version_id || a.id}
              onClick={() => openArtwork(a, a._display_version_id)}
            >
              <div className={`artwork-cover color-${i % 4}`}>
                <FileCover
                  data={d}
                  artwork={
                    a._display_version_id
                      ? { ...a, active_version_id: a._display_version_id }
                      : a
                  }
                />
                <span className="version-chip">V{v?.number || "—"}</span>
              </div>
              <div className="artwork-card-info">
                <small>{a.packaging_type}</small>
                <h3>{a.name}</h3>
                <div>
                  {badge(v?.status || a.status)}
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
  return (
    <WorkspaceChrome
      data={d}
      locale={locale}
      view={view}
      search={search}
      onSearch={changeSearch}
      onGo={go}
      onLocale={() => L(locale === "ru" ? "kz" : "ru")}
      onRefresh={() => void load().catch(() => {})}
      onLogout={async () => {
        clearData();
        await fetch("/api/auth/logout", { method: "POST" });
        notifySessionChange("logout");
        location.assign("/login");
      }}
    >
      <main
        inert={loading}
        aria-busy={loading}
        id="workspace-main"
        className={`main-content ${view === "artwork" ? "artwork-main" : ""}`}
      >
        {!!d.demo_context?.length && <DemoWorkspaceBar locale={locale} />}
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
          (d.setup_complete === false ||
            (d.setup_complete === undefined &&
              (!d.organizations.some((o) => o.kind === "manufacturer") ||
                !d.organizations.some((o) => o.kind === "client") ||
                !d.profiles.some((p) => p.role === "designer" && p.active) ||
                !d.profiles.some((p) => p.role === "prepress" && p.active) ||
                !d.projects.length))) && (
            <SetupWizard
              data={d}
              locale={locale}
              onRefresh={load}
              onCreateProject={() =>
                openModal("project.create", { entityId: undefined })
              }
            />
          )}
        {view === "home" && !production && (
          <Dashboard
            data={d}
            locale={locale}
            onGo={go}
            onProject={openProject}
            onArtwork={openArtwork}
            onCreate={() =>
              void openModal("project.create", { entityId: undefined })
            }
          />
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
                <div className="eyebrow">PACKAGING OPERATIONS / {t(view)}</div>
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
              onSearch={changeSearch}
              filters={catalogFilters}
              onFilters={changeFilters}
            />
          </>
        )}

        {view === "settings" && u.role === "admin" && (
          <PeopleManagement
            data={d}
            locale={locale}
            onRefresh={load}
            onEdit={(p) =>
              void openModal("profile.update", {
                entityId: p.id,
                rowVersion: p.row_version,
                profile: p,
              })
            }
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
                    className="btn primary"
                    disabled={project.status !== "active"}
                    onClick={() =>
                      void openModal("artwork.create", {
                        entityId: project.id,
                        payload: { deadline: project.deadline.slice(0, 10) },
                      })
                    }
                  >
                    <Plus size={16} />
                    {t("addArtwork")}
                  </button>
                )}
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
                {t("designer")}: {name(project.designer_id)} · {t("prepress")}:{" "}
                {name(project.prepress_id)}
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
              view === "allArtworks"
                ? d.artworks
                : d.versions
                    .filter((v) => v.status === "approved")
                    .flatMap((v) => {
                      const a = d.artworks.find((a) => a.id === v.artwork_id);
                      return a ? [{ ...a, _display_version_id: v.id }] : [];
                    }),
            )}
          </>
        )}
        {view === "artwork" && artwork && (
          <ArtworkWorkspace
            key={artwork.id}
            data={d}
            locale={locale}
            artworkId={artworkId}
            versionId={versionId}
            previewChoice={previewChoice}
            MODE={MODE}
            compareId={compareId}
            CI={CI}
            loading={loading}
            busy={busy}
            selectVersion={selectVersion}
            openProject={openProject}
            onModal={openModal}
            command={command}
          />
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
                    !["transferred", "received", "revoked"].includes(filter) ||
                    p.status === filter,
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
                      {o.project_count ??
                        d.projects.filter((p) => p.organization_id === o.id)
                          .length}{" "}
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
                {d.notifications.filter((n) => !n.read_at).length} {t("unread")}
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
                    <p>{d.projects.find((p) => p.id === n.project_id)?.name}</p>
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
                        void command("notification.read", n.id).catch(() => {})
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
        {view === "reports" && staff && <Reports data={d} locale={locale} />}
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
            {u.role !== "admin" && (
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
            )}
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
                          openArtwork(a, th.version_id);
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
                    <button
                      className="history-row clickable"
                      key={r.id}
                      onClick={() => {
                        const a = d.artworks.find((a) => a.id === r.artwork_id);
                        if (a) openArtwork(a, r.version_id);
                      }}
                    >
                      <span>
                        {d.artworks.find((a) => a.id === r.artwork_id)?.name} ·
                        V{d.versions.find((v) => v.id === r.version_id)?.number}
                      </span>
                      {badge(r.status)}
                      <small>{date(r.created_at)}</small>
                    </button>
                  ))}
            </section>
          </>
        )}
        <footer className="app-footer">
          <span>© 2026 QAZALPACK</span>
          <span>PackApprove</span>
        </footer>
        {d.pagination && d.pagination.pages > 1 && (
          <nav
            className="pagination"
            aria-label={locale === "ru" ? "Страницы" : "Беттер"}
          >
            <button
              className="btn"
              disabled={catalogPage <= 1}
              onClick={() => changeCatalogPage(catalogPage - 1)}
            >
              <ArrowLeft size={16} />
              {locale === "ru" ? "Назад" : "Артқа"}
            </button>
            <span>
              {catalogPage} / {d.pagination.pages} · {d.pagination.total}
            </span>
            <button
              className="btn"
              disabled={catalogPage >= d.pagination.pages}
              onClick={() => changeCatalogPage(catalogPage + 1)}
            >
              {locale === "ru" ? "Далее" : "Келесі"}
              <ArrowRight size={16} />
            </button>
          </nav>
        )}
      </main>
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
    </WorkspaceChrome>
  );
}
