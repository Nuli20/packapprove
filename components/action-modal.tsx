"use client";
import { useState, useEffect } from "react";
import {
  X,
  UploadCloud,
  Loader2,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { translate, eventKeys, type Locale } from "@/lib/i18n";
import type { Row, State } from "./workspace";
import { directUpload } from "@/lib/direct-upload";
import { useModalFocus } from "./use-modal-focus";
import ProjectWizard from "./project-wizard";
export default function ActionModal({
  modal: m,
  data: initialData,
  locale,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  modal: Row;
  data: State;
  locale: Locale;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (a: string, id?: string, p?: Row, rv?: number) => Promise<any>;
}) {
  const t = (k: string) => translate(locale, k);
  const [d, D] = useState(initialData);
  useEffect(() => D(initialData), [initialData]);
  const [p, P] = useState<Row>({
    role: m.profile?.role || "observer",
    active: m.profile?.active ?? true,
    content: m.brief || {},
    status: "ready",
    templateId: m.action === "review.complete" ? d.templates[0]?.id : "",
    approvers: [],
    observers: [],
    deadline: new Date(Date.now() + 604800000).toISOString().slice(0, 16),
    ...m.payload,
  });
  const [uploads, U] = useState<Row>(
    m.presetFile ? { preview: m.presetFile, production: m.presetFile } : {},
  );
  const [checks, CH] = useState<Row>({});
  const [confirm, CF] = useState(false);
  const [localError, LE] = useState("");
  const [uploading, UPLOADING] = useState(false);
  const dialogRef = useModalFocus(onClose, busy || uploading);
  const set = (k: string, v: unknown) => P({ ...p, [k]: v });
  const action = m.action;
  const title = t(eventKeys[action] || action);
  const field = (
    key: string,
    label: string,
    type = "text",
    required = true,
  ) => (
    <label key={key}>
      {t(label)}
      {type === "textarea" ? (
        <textarea
          required={required}
          value={p[key] || ""}
          onChange={(e) => set(key, e.target.value)}
        />
      ) : (
        <input
          type={type}
          required={required}
          value={p[key] || ""}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </label>
  );
  const select = (
    key: string,
    label: string,
    items: { value: string; label: string }[],
    required = true,
  ) => (
    <label>
      {t(label)}
      <select
        required={required}
        value={p[key] || ""}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">{t("select")}</option>
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    LE("");
    UPLOADING(true);
    try {
      let payload = { ...p };
      if (action === "version.create") {
        payload = {
          changes: p.changes,
          canSpec: p.canSpec,
          files: await Promise.all(
            Object.entries(uploads)
              .filter(([, v]) => v)
              .map(([kind, file]) => directUpload(m.entityId, kind, file)),
          ),
        };
      }
      if (action === "review.complete") {
        const template = d.templates.find((t) => t.id === p.templateId);
        payload.items = template!.items.map((label: string) => ({
          label,
          passed: !!checks[label],
        }));
      }
      if (action === "round.open")
        payload.deadline = new Date(p.deadline).toISOString();
      if (action === "template.create")
        payload.items = String(p.items || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      if (action === "decision.create" && p.result === "approved" && !confirm) {
        LE(t("confirmApprove"));
        return;
      }
      await onSubmit(action, m.entityId, payload, m.rowVersion);
    } catch (e) {
      LE((e as Error).message);
    } finally {
      UPLOADING(false);
    }
  }
  const approverOptions = d.profiles.filter(
    (pr) =>
      pr.role === "approver" &&
      d.memberships.some(
        (ms) => ms.user_id === pr.id && ms.organization_id === m.organizationId,
      ),
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) =>
        e.target === e.currentTarget && !busy && !uploading && onClose()
      }
    >
      <section
        ref={dialogRef}
        className={`modal ${action === "project.create" ? "project-create-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">PACKAPPROVE</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            disabled={busy || uploading}
            aria-label={t("close")}
          >
            <X size={21} />
          </button>
        </div>
        {uploading && (
          <p role="status" className="upload-progress">
            {locale === "ru"
              ? "Проверяем и сохраняем файлы в закрытое хранилище…"
              : "Файлдар тексеріліп, жабық қоймаға сақталуда…"}
          </p>
        )}
        {(error || localError) && (
          <div className="alert error" role="alert">
            {localError || error}
          </div>
        )}
        {action === "project.create" ? (
          <ProjectWizard
            data={d}
            locale={locale}
            busy={busy}
            onChanged={D}
            onClose={onClose}
            onSubmit={async (v) => {
              await onSubmit(action, undefined, v);
            }}
          />
        ) : (
          <form className="modal-form" onSubmit={submit}>
            {action === "invitation.link" && (
              <>
                <p>{t("shareInvite")}</p>
                <input readOnly value={m.url} aria-label={t("invite")} />
                <button
                  className="btn"
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(m.url)}
                >
                  {t("copy")}
                </button>
              </>
            )}
            {action === "version.create" && (
              <>
                <div className="alert info">
                  <LockKeyhole size={18} />
                  {t("fixed")}
                </div>
                {field("changes", "changeLog", "textarea")}
                {["preview", "production", "source"].map((kind) => (
                  <label className="upload-label" key={kind}>
                    <UploadCloud size={23} />
                    <b>{t(kind === "production" ? "productionFile" : kind)}</b>
                    <small>{t("upload")}</small>
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      required={kind !== "source" && !uploads[kind]}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && f.size > 25 * 1024 * 1024) {
                          LE(t("upload"));
                          return;
                        }
                        U({ ...uploads, [kind]: f });
                      }}
                    />
                  </label>
                ))}
              </>
            )}
            {action === "round.open" && (
              <>
                <p className="muted">{t("allPolicy")}</p>
                <label>{t("approvers")}</label>
                {approverOptions.map((pr) => (
                  <label className="checkbox-label" key={pr.id}>
                    <input
                      type="checkbox"
                      checked={p.approvers.includes(pr.id)}
                      onChange={(e) =>
                        set(
                          "approvers",
                          e.target.checked
                            ? [...p.approvers, pr.id]
                            : p.approvers.filter((id: string) => id !== pr.id),
                        )
                      }
                    />
                    {pr.full_name}
                  </label>
                ))}
                <label>{t("observers")}</label>
                {d.profiles
                  .filter(
                    (pr) =>
                      pr.role === "observer" &&
                      d.memberships.some(
                        (ms) =>
                          ms.user_id === pr.id &&
                          ms.organization_id === m.organizationId,
                      ),
                  )
                  .map((pr) => (
                    <label className="checkbox-label" key={pr.id}>
                      <input
                        type="checkbox"
                        checked={p.observers.includes(pr.id)}
                        onChange={(e) =>
                          set(
                            "observers",
                            e.target.checked
                              ? [...p.observers, pr.id]
                              : p.observers.filter(
                                  (id: string) => id !== pr.id,
                                ),
                          )
                        }
                      />
                      {pr.full_name}
                    </label>
                  ))}
                {field("deadline", "deadline", "datetime-local")}
              </>
            )}
            {action === "review.complete" && (
              <>
                {select(
                  "templateId",
                  "template",
                  d.templates.map((tp) => ({
                    value: tp.id,
                    label: `${tp.name} · V${tp.number}`,
                  })),
                )}
                {d.templates
                  .find((tp) => tp.id === p.templateId)
                  ?.items.map((label: string) => (
                    <label className="checkbox-label" key={label}>
                      <input
                        type="checkbox"
                        checked={!!checks[label]}
                        onChange={(e) =>
                          CH({ ...checks, [label]: e.target.checked })
                        }
                      />
                      {label}
                    </label>
                  ))}
                {select("status", "result", [
                  { value: "ready", label: t("readyCheck") },
                  { value: "limited", label: t("limitedCheck") },
                  { value: "correction", label: t("correctionCheck") },
                ])}
                {field("notes", "notes", "textarea", false)}
              </>
            )}
            {action === "decision.create" && (
              <>
                <div className="alert info">
                  <ShieldCheck size={20} />
                  {t("fixed")}
                </div>
                {field(
                  "comment",
                  "decisionComment",
                  "textarea",
                  p.result === "changes_requested",
                )}
                {p.result === "approved" && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={confirm}
                      required
                      onChange={(e) => CF(e.target.checked)}
                    />
                    {t("confirmApprove")}
                  </label>
                )}
              </>
            )}
            {action === "comment.create" && (
              <>
                {field("body", "comments", "textarea")}
                {!["observer", "approver"].includes(d.user.role) &&
                  select("visibility", "view", [
                    { value: "client", label: t("clientComment") },
                    { value: "internal", label: t("internalComment") },
                  ])}
                {select("type", "comments", [
                  { value: "design", label: t("design") },
                  { value: "technical", label: t("technicalType") },
                  { value: "question", label: t("question") },
                ])}
                <small className="muted">
                  {t("page")} {p.page} · X {Number(p.x).toFixed(3)} / Y{" "}
                  {Number(p.y).toFixed(3)}
                </small>
              </>
            )}
            {action === "comment.reply" && field("body", "reply", "textarea")}
            {action === "comment.carry" &&
              select(
                "targetVersionId",
                "version",
                m.versions.map((v: Row) => ({
                  value: v.id,
                  label: `V${v.number} · ${v.changes}`,
                })),
              )}
            {action === "comment.resolve" &&
              select(
                "fixedInVersionId",
                "version",
                m.versions.map((v: Row) => ({
                  value: v.id,
                  label: `V${v.number} · ${v.changes}`,
                })),
              )}
            {action === "package.issue" && (
              <div className="alert info">
                <ShieldCheck size={24} />
                {t("notReady")}
              </div>
            )}
            {action === "package.ack" && (
              <>
                <p>{t("productionNote")}</p>
                {field("sha256", "checksum")}
                <small className="muted">
                  {t("checksum")}: {m.checksum}
                </small>
              </>
            )}
            {action === "package.revoke" &&
              field("reason", "reason", "textarea")}
            {action === "project.update" && (
              <>
                {field("name", "name")}
                {field("description", "description", "textarea", false)}
                {field("contacts", "contacts", "text", false)}
                {field("customerOrder", "customerOrder", "text", false)}
                {field("deadline", "deadline", "date")}
                {select(
                  "status",
                  "status",
                  ["active", "paused", "completed", "archived"].map((r) => ({
                    value: r,
                    label: t(r),
                  })),
                )}
                {select(
                  "priority",
                  "priority",
                  ["normal", "high", "low"].map((r) => ({
                    value: r,
                    label: t(r),
                  })),
                )}
                {select(
                  "designerId",
                  "designer",
                  d.profiles
                    .filter((pr) => pr.role === "designer")
                    .map((pr) => ({ value: pr.id, label: pr.full_name })),
                )}
                {select(
                  "prepressId",
                  "prepress",
                  d.profiles
                    .filter((pr) => pr.role === "prepress")
                    .map((pr) => ({ value: pr.id, label: pr.full_name })),
                )}
              </>
            )}
            {action === "organization.create" && field("name", "name")}
            {action === "invitation.create" && (
              <>
                {select(
                  "organizationId",
                  "organization",
                  d.organizations
                    .filter(
                      (o) => d.user.role === "admin" || o.kind === "client",
                    )
                    .map((o) => ({ value: o.id, label: o.name })),
                )}
                {field("email", "email", "email")}
                {select(
                  "role",
                  "security",
                  (d.user.role === "admin"
                    ? [
                        "observer",
                        "approver",
                        "admin",
                        "manager",
                        "designer",
                        "prepress",
                        "production",
                      ]
                    : ["observer", "approver"]
                  ).map((r) => ({
                    value: r,
                    label: t(r === "production" ? "productionRole" : r),
                  })),
                )}
              </>
            )}
            {action === "profile.update" && (
              <>
                {select(
                  "role",
                  "security",
                  [
                    "admin",
                    "manager",
                    "designer",
                    "prepress",
                    "observer",
                    "approver",
                    "production",
                  ].map((r) => ({
                    value: r,
                    label: t(r === "production" ? "productionRole" : r),
                  })),
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={(e) => set("active", e.target.checked)}
                  />
                  {t("active")}
                </label>
              </>
            )}
            {action === "template.create" && (
              <>
                {select(
                  "templateId",
                  "template",
                  d.templates.map((tp) => ({
                    value: tp.template_id,
                    label: tp.name,
                  })),
                  false,
                )}
                {!p.templateId && field("name", "name")}
                {field("items", "template", "textarea")}
              </>
            )}
            {action === "brief.save" && (
              <>
                {[
                  "dimensions",
                  "units",
                  "material",
                  "printing",
                  "pages",
                  "languages",
                  "mandatoryText",
                  "brandColors",
                  "barcode",
                  "logos",
                  "finishing",
                  "references",
                  "comments",
                ].map((k) => (
                  <label key={k}>
                    {t(
                      k === "printing"
                        ? "print"
                        : k === "comments"
                          ? "commentsBrief"
                          : k,
                    )}
                    <textarea
                      value={
                        Array.isArray(p.content[k])
                          ? p.content[k].join(", ")
                          : p.content[k] || ""
                      }
                      onChange={(e) =>
                        set("content", { ...p.content, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={busy || uploading}
              >
                {t("cancel")}
              </button>
              <button
                className="btn primary"
                hidden={action === "invitation.link"}
                disabled={
                  busy ||
                  uploading ||
                  (action === "round.open" && !p.approvers.length)
                }
              >
                {busy ? <Loader2 className="spin" size={17} /> : t("save")}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
