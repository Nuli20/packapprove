"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  LayoutGrid,
  List,
  Clock3,
  CheckCircle2,
  FileCheck2,
  AlertTriangle,
} from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
import { operationalItems, nextBlock } from "@/lib/workflow";
import type { State, Row } from "./workspace";
import PdfViewer from "./pdf-viewer";
export function FileCover({ data, artwork }: { data: State; artwork: Row }) {
  const f = data.files.find(
    (f) => f.version_id === artwork.active_version_id && f.kind === "preview",
  );
  return (
    <div className="real-file-cover">
      {f ? (
        f.mime_type === "application/pdf" ? (
          <PdfViewer url={`/api/files/${f.id}?view=1`} zoom={0.24} page={1} />
        ) : (
          <img src={`/api/files/${f.id}?view=1`} alt={artwork.name} />
        )
      ) : (
        <span>PDF / —</span>
      )}
    </div>
  );
}
export default function Operations({
  data: d,
  view,
  locale,
  onArtwork,
  onProject,
  search,
  onSearch,
}: {
  data: State;
  view: string;
  locale: Locale;
  onArtwork: (a: Row) => void;
  onProject: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  const t = (k: string) => translate(locale, k);
  const [layout, L] = useState("table");
  const [sort, S] = useState("deadline");
  const [client, C] = useState("");
  const [status, ST] = useState("");
  const name = (id: string) =>
    d.profiles.find((p) => p.id === id)?.full_name || t("unassigned");
  const date = (v: string) =>
    new Date(v).toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ");
  const items = operationalItems(d);
  if (view === "projects") {
    const projects = d.projects
      .filter(
        (p) =>
          (!client || p.organization_id === client) &&
          (!status || p.status === status) &&
          `${p.name} ${p.organization_name}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort((a, b) => String(a[sort]).localeCompare(String(b[sort])));
    return (
      <>
        <div className="catalog-toolbar">
          <label className="catalog-search">
            {t("search")}
            <input
              value={search}
              placeholder={t("search")}
              onChange={(e) => onSearch(e.target.value)}
            />
          </label>
          <label>
            {t("organization")}
            <select value={client} onChange={(e) => C(e.target.value)}>
              <option value="">{t("all")}</option>
              {d.organizations
                .filter((o) => o.kind === "client")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("status")}
            <select value={status} onChange={(e) => ST(e.target.value)}>
              <option value="">{t("all")}</option>
              {["active", "paused", "completed", "archived"].map((s) => (
                <option value={s} key={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("sort")}
            <select value={sort} onChange={(e) => S(e.target.value)}>
              <option value="deadline">{t("deadline")}</option>
              <option value="name">{t("name")}</option>
              <option value="created_at">{t("date")}</option>
            </select>
          </label>
          <button
            className="btn"
            onClick={() => L(layout === "table" ? "cards" : "table")}
          >
            {layout === "table" ? <LayoutGrid size={18} /> : <List size={18} />}{" "}
            {t(layout === "table" ? "cards" : "table")}
          </button>
        </div>
        {layout === "table" ? (
          <section className="panel project-table-wrap">
            <table className="project-table">
              <thead>
                <tr>
                  <th>{t("project")}</th>
                  <th>{t("artworks")}</th>
                  <th>{t("deadline")}</th>
                  <th>{t("manager")}</th>
                  <th>{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    onClick={() => onProject(p.id)}
                    onKeyDown={(e) => e.key === "Enter" && onProject(p.id)}
                  >
                    <td>
                      <b>{p.name}</b>
                      <small>{p.organization_name}</small>
                    </td>
                    <td>
                      {d.artworks.filter((a) => a.project_id === p.id).length}
                    </td>
                    <td>{date(p.deadline)}</td>
                    <td>{name(p.manager_id)}</td>
                    <td>{t(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <div className="queue-grid">
            {projects.map((p) => (
              <button
                className="panel queue-card"
                key={p.id}
                onClick={() => onProject(p.id)}
              >
                {(() => {
                  const a = d.artworks.find((a) => a.project_id === p.id);
                  return a ? <FileCover data={d} artwork={a} /> : null;
                })()}
                <small>{p.organization_name}</small>
                <h2>{p.name}</h2>
                <p>
                  {date(p.deadline)} · {t(p.status)}
                </p>
              </button>
            ))}
          </div>
        )}
        {!projects.length && (
          <div className="empty-state">{t("emptyProjects")}</div>
        )}
      </>
    );
  }
  const list = items
    .filter(
      (i) =>
        (view === "tasks"
          ? i.mine
          : view === "ready"
            ? i.ready
            : view === "changes"
              ? i.correction || i.threads.length > 0
              : i.stage === view) &&
        `${i.a.name} ${i.project?.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  return (
    <>
      <div className="section-intro">
        <p>{t(view + "Intro")}</p>
        <span>
          {list.length} {t("items")}
        </span>
      </div>
      <div className="queue-grid">
        {list.map((i) => (
          <article className="panel queue-card" key={i.a.id}>
            <div className="panel-heading">
              <span className="version-chip inline">
                V{i.version?.number || "—"}
              </span>
              <span className={`badge ${i.version?.status}`}>
                {t(i.version?.status || "draft")}
              </span>
            </div>
            <FileCover data={d} artwork={i.a} />
            <small>{i.project?.name}</small>
            <h2>{i.a.name}</h2>
            <p>
              {t("deadline")}: {date(i.deadline)}
            </p>
            <p>
              {t("responsible")}: {name(i.responsible)}
            </p>
            {view === "approval" && i.round && (
              <div className="approval-summary">
                {d.participants
                  .filter(
                    (p) => p.round_id === i.round!.id && p.kind === "approver",
                  )
                  .map((p) => (
                    <p key={p.id}>
                      {d.decisions.some(
                        (x) =>
                          x.round_id === i.round!.id && x.user_id === p.user_id,
                      )
                        ? "✓"
                        : "○"}{" "}
                      {name(p.user_id)}
                    </p>
                  ))}
              </div>
            )}
            {view === "changes" &&
              i.threads.map((th) => (
                <p key={th.id} className="queue-comment">
                  {d.comments.find((c) => c.thread_id === th.id)?.body}
                </p>
              ))}
            <p className="queue-block">{t(nextBlock(i))}</p>
            <button className="btn primary" onClick={() => onArtwork(i.a)}>
              {t(
                view === "internal"
                  ? "technical"
                  : view === "ready"
                    ? "issue"
                    : view === "approval"
                      ? "clientApproval"
                      : view === "changes"
                        ? "compare"
                        : "open",
              )}
              <ArrowUpRight size={16} />
            </button>
          </article>
        ))}
      </div>
      {!list.length && (
        <div className="empty-state">
          <CheckCircle2 size={28} />
          <h2>{t("queueEmpty")}</h2>
          <p>{t("queueEmptyHelp")}</p>
        </div>
      )}
    </>
  );
}
export function WorkflowSteps({
  data,
  artwork,
  locale,
}: {
  data: State;
  artwork: Row;
  locale: Locale;
}) {
  const i = operationalItems(data).find((i) => i.a.id === artwork.id);
  if (!i) return null;
  const t = (k: string) => translate(locale, k);
  const keys = ["design", "internal", "approval", "ready", "production"];
  return (
    <div className="workflow-steps" aria-label={t("workflow")}>
      {keys.map((k, n) => (
        <div
          key={k}
          className={`workflow-step ${(i.stage === "changes" ? "design" : i.stage) === k ? "current" : ""}`}
        >
          <small>0{n + 1}</small>
          <b>{t(k === "design" ? "newVersion" : k)}</b>
        </div>
      ))}
      <p>{t(nextBlock(i))}</p>
    </div>
  );
}
