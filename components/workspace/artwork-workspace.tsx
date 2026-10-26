"use client";
import { useEffect, useState } from "react";
import {
  UploadCloud,
  Users,
  Clock3,
  ArrowLeft,
  ArrowRight,
  Plus,
  Send,
  Factory,
  Layers,
  Check,
  ScanLine,
  LockKeyhole,
  Download,
  FileText,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  CheckCircle2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import * as StudioTabs from "@radix-ui/react-tabs";
import { translate, type Locale } from "@/lib/i18n";
import type { WorkspaceState, Row } from "@/lib/models";
import { DEFAULT_CAN_SPEC } from "@/lib/can-spec";
import { WorkflowSteps } from "../operations";
import PdfViewer from "../pdf-viewer";
const CanStudio = dynamic(() => import("../can-studio/studio"), {
  ssr: false,
  loading: () => <div className="empty">Can Studio…</div>,
});
type Props = {
  data: WorkspaceState;
  locale: Locale;
  artworkId: string;
  versionId: string;
  previewChoice: string;
  MODE: (v: string) => void;
  compareId: string;
  CI: (v: string) => void;
  loading: boolean;
  busy: boolean;
  selectVersion: (id: string) => void;
  openProject: (id: string) => void;
  onModal: (action: string, extra?: Row) => void;
  command: (
    action: string,
    id?: string,
    payload?: Row,
    rowVersion?: number,
  ) => Promise<any>;
};
export default function ArtworkWorkspace({
  data: d,
  locale,
  artworkId,
  versionId,
  previewChoice,
  MODE,
  compareId,
  CI,
  loading,
  busy,
  selectVersion,
  openProject,
  onModal,
  command,
}: Props) {
  const t = (k: string) => translate(locale, k),
    u = d.user,
    staff = ["admin", "manager", "designer", "prepress"].includes(u.role),
    manage = ["admin", "manager"].includes(u.role);
  const [tab, T] = useState(() =>
      ["approver", "observer"].includes(d.user.role)
        ? "clientApproval"
        : d.user.role === "prepress"
          ? "technical"
          : "comments",
    ),
    [zoom, Z] = useState(() =>
      typeof window !== "undefined" && window.innerWidth < 681 ? 0.55 : 1,
    ),
    [page, PG] = useState(1),
    [pages, PGS] = useState(1),
    [compare, C] = useState(previewChoice === "compare");
  const artwork = d.artworks.find((a) => a.id === artworkId),
    project = d.projects.find((p) => p.id === artwork?.project_id),
    versions = d.versions.filter((v) => v.artwork_id === artworkId);
  const selected =
      versions.find(
        (v) => v.id === (versionId || artwork?.active_version_id),
      ) || versions[0],
    round = d.rounds.find((r) => r.version_id === selected?.id),
    review = d.reviews.find((r) => r.version_id === selected?.id),
    threads = d.threads.filter((t) => t.version_id === selected?.id),
    files = d.files.filter((f) => f.version_id === selected?.id),
    preview = files.find((f) => f.kind === "preview"),
    active = selected?.id === artwork?.active_version_id,
    meDecision = d.decisions.find(
      (x) => x.round_id === round?.id && x.user_id === u.id,
    );
  const previewMode =
    previewChoice === "auto"
      ? d.visualizations.some((x) => x.version_id === selected?.id)
        ? "3d"
        : "2d"
      : previewChoice;
  useEffect(() => {
    PG(1);
  }, [selected?.id]);
  useEffect(() => {
    C(previewChoice === "compare");
  }, [previewChoice]);
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
  const openModal = (action: string, extra: Row = {}) =>
    onModal(action, {
      entityId: selected?.id,
      versionNumber: selected?.number,
      filename: preview?.filename,
      checksum: preview?.sha256,
      ...extra,
      ...(action === "version.create"
        ? {
            payload: {
              canSpec:
                d.visualizations.find((v) => v.version_id === selected?.id)
                  ?.spec || DEFAULT_CAN_SPEC,
              ...extra.payload,
            },
          }
        : {}),
    });
  if (!artwork) return null;
  return (
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
            <span className="large-version">V{selected?.number || "—"}</span>
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
              {locale === "ru"
                ? versions.length
                  ? "Добавить новую версию"
                  : "Загрузить первый макет"
                : versions.length
                  ? "Жаңа нұсқа қосу"
                  : "Алғашқы макетті жүктеу"}
            </button>
          )}
          {u.role === "designer" && active && selected?.status === "fixed" && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void command("version.submit", selected.id).catch(() => {})
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
            review?.status === "ready" &&
            round?.status !== "open" &&
            round?.status !== "approved" &&
            ["internal_review", "published"].includes(selected?.status) && (
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
            review?.status === "ready" &&
            round?.status === "approved" &&
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
          {versions.some((v) => v.id === artwork.active_version_id) && (
            <button
              className="text-btn"
              onClick={() => selectVersion(artwork.active_version_id)}
            >
              {t("latest")}
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
      <div className="version-strip">
        {versions.map((v) => (
          <button
            key={v.id}
            className={selected?.id === v.id ? "selected" : ""}
            onClick={() => {
              selectVersion(v.id);
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
          const params = new URLSearchParams(location.search);
          params.set("mode", value);
          history.replaceState(null, "", "/?" + params);
          C(value === "compare");
          if (value === "compare")
            CI(versions.find((v) => v.id !== selected?.id)?.id || "");
        }}
        className="studio-mode-tabs"
      >
        <StudioTabs.List
          aria-label={locale === "ru" ? "Режим просмотра" : "Қарау режимі"}
        >
          <StudioTabs.Trigger value="2d">
            {locale === "ru" ? "2D-развёртка" : "2D жайма"}
          </StudioTabs.Trigger>
          <StudioTabs.Trigger value="3d" disabled={!selected || !preview}>
            {locale === "ru" ? "3D-банка" : "3D құты"}
          </StudioTabs.Trigger>
          <StudioTabs.Trigger value="compare" disabled={versions.length < 2}>
            {t("compare")}
          </StudioTabs.Trigger>
        </StudioTabs.List>
      </StudioTabs.Root>
      <div
        className={`studio ${previewMode === "3d" ? "studio-with-can" : ""}`}
      >
        {loading ? (
          <div className="viewer-section empty" role="status">
            {locale === "ru" ? "Загрузка версии…" : "Нұсқа жүктелуде…"}
          </div>
        ) : previewMode === "3d" && selected ? (
          <CanStudio
            key={selected.id + ":" + (preview?.id || "loading")}
            file={preview}
            version={selected}
            versions={versions}
            savedSpec={
              d.visualizations?.find((v) => v.version_id === selected.id)?.spec
            }
            role={u.role}
            locale={locale}
            onVersion={(id) => {
              selectVersion(id);
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
                  aria-label={t("zoomOut")}
                  onClick={() => Z(Math.max(0.3, zoom - 0.15))}
                >
                  <ZoomOut size={17} />
                </button>
                <b>{Math.round(zoom * 100)}%</b>
                <button
                  className="icon-btn"
                  aria-label={t("zoomIn")}
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
                <select value={compareId} onChange={(e) => CI(e.target.value)}>
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
            <div className={`preview-stage ${compare ? "compare-stage" : ""}`}>
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
                          d.comments.find((c) => c.thread_id === th.id)?.body
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
                      (f) => f.version_id === compareId && f.kind === "preview",
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
                <a className="file-row" key={f.id} href={`/api/files/${f.id}`}>
                  <span className="pdf-icon">
                    <FileText size={19} />
                  </span>
                  <div>
                    <b>{f.filename}</b>
                    <small>
                      {t(f.kind === "production" ? "productionFile" : f.kind)} ·{" "}
                      {(f.size / 1024).toFixed(1)} KB · SHA-256{" "}
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
                      {th.carried_from_id && <small>{t("carried")}</small>}
                      {th.status === "resolved" && (
                        <CheckCircle2 size={13} className="green-text" />
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
                      {["designer", "manager", "admin"].includes(u.role) &&
                        th.status === "open" &&
                        versions.some((v) => v.number > selected!.number) && (
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
                      {["designer", "manager", "admin"].includes(u.role) &&
                        th.status === "open" &&
                        versions.some((v) => v.number > selected!.number) && (
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
                          x.round_id === round.id && x.user_id === p.user_id,
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
                      V{d.versions.find((v) => v.id === r.version_id)?.number} ·{" "}
                      {date(r.created_at)}
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
                    {name(review.reviewer_id)} · {date(review.created_at)}
                  </p>
                  {d.reviewItems
                    .filter((i) => i.review_id === review.id)
                    .map((i) => (
                      <div className="checklist-line" key={i.id}>
                        {i.passed ? (
                          <CheckCircle2 size={17} className="green-text" />
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
                        brief: d.briefs.find((b) => b.artwork_id === artwork.id)
                          ?.content,
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
                            {Array.isArray(v) ? v.join(", ") : String(v) || "—"}
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
      {u.role === "approver" &&
        active &&
        round?.status === "open" &&
        !meDecision &&
        d.participants.some(
          (p) =>
            p.round_id === round.id &&
            p.user_id === u.id &&
            p.kind === "approver",
        ) && (
          <div className="mobile-decision-bar">
            <small>
              V{selected?.number} · {t("awaiting")}
            </small>
            <button
              className="btn primary"
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
              className="btn"
              onClick={() =>
                openModal("decision.create", {
                  entityId: round.id,
                  payload: { result: "changes_requested" },
                })
              }
            >
              {t("requestChanges")}
            </button>
          </div>
        )}
    </>
  );
}
