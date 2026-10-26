"use client";
import ProjectCatalog, {
  type CatalogFilters,
} from "./workspace/project-catalog";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
import { operationalItems, nextBlock } from "@/lib/workflow";
import type { State, Row } from "./workspace";

import { FileCover } from "./workspace/file-cover";
export { FileCover } from "./workspace/file-cover";
export default function Operations({
  data: d,
  view,
  locale,
  onArtwork,
  onProject,
  search,
  onSearch,
  filters,
  onFilters,
}: {
  data: State;
  view: string;
  locale: Locale;
  onArtwork: (a: Row) => void;
  onProject: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  filters: CatalogFilters;
  onFilters: (filters: CatalogFilters) => void;
}) {
  const t = (k: string) => translate(locale, k);
  const name = (id?: string) =>
    d.profiles.find((p) => p.id === id)?.full_name || t("unassigned");
  const date = (v: string) =>
    new Date(v).toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ");
  const items = operationalItems(d);
  if (view === "projects")
    return (
      <ProjectCatalog
        data={d}
        locale={locale}
        onProject={onProject}
        search={search}
        onSearch={onSearch}
        filters={filters}
        onFilters={onFilters}
      />
    );
  const list = items
    .filter(
      (i) =>
        (view === "tasks"
          ? i.mine
          : view === "ready"
            ? i.ready
            : view === "changes"
              ? i.correction
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
  const keys = i.client
    ? ["design", "approval", "approved", "production"]
    : ["design", "internal", "approval", "ready", "production"];
  const phase =
    i.stage === "changes"
      ? "design"
      : i.stage === "dispatch"
        ? "approval"
        : i.stage;
  return (
    <div className="workflow-overview">
      <details className="workflow-details">
        <summary>
          <span>
            {t("workflow")} · V{i.version?.number || "—"}
          </span>
          <b>
            {t(i.stage)} · {Math.max(1, keys.indexOf(phase) + 1)}/{keys.length}
          </b>
        </summary>
        <div className="workflow-steps">
          {keys.map((k, n) => (
            <div
              key={k}
              className={`workflow-step ${phase === k ? "current" : ""}`}
            >
              <small>0{n + 1}</small>
              <b>{t(k === "design" ? "newVersion" : k)}</b>
            </div>
          ))}
        </div>
      </details>
      <p className={`workflow-next ${i.pkg?.status || ""}`}>
        {t(nextBlock(i))}
      </p>
    </div>
  );
}
