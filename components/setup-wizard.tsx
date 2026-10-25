"use client";
import { useState } from "react";
import { Check, ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import type { State, Row } from "./workspace";
import type { Locale } from "@/lib/i18n";
import { setupCopy as copy, setupSteps } from "@/lib/setup-copy";
export async function setupCommand(
  action: string,
  entityId?: string,
  payload: Row = {},
  rowVersion?: number,
) {
  const r = await fetch("/api/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ action, entityId, payload, rowVersion }),
  });
  const j = await r.json();
  if (!r.ok) {
    if (r.status === 401) {
      location.href = "/login?reason=session-expired";
    }
    throw Error(j.error || "Не удалось сохранить данные");
  }
  return j;
}
export function PreparationPanel({
  data,
  locale,
  onChanged,
  onClient,
}: {
  data: State;
  locale: Locale;
  onChanged: (s: State) => void;
  onClient?: (id: string) => void;
}) {
  const kz = locale === "kz";
  const [mode, M] = useState("");
  const [value, V] = useState("");
  const [role, R] = useState("designer");
  const [url, U] = useState("");
  const [error, E] = useState("");
  const [busy, B] = useState(false);
  async function refresh() {
    const r = await fetch("/api/state", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw Error(j.error);
    onChanged(j);
  }
  async function save() {
    B(true);
    E("");
    try {
      if (mode === "client") {
        const result = await setupCommand("organization.create", undefined, {
          name: value,
        });
        await refresh();
        onClient?.(result.id);
        M("");
        V("");
      } else if (mode === "company") {
        await setupCommand("company.initialize");
        await refresh();
        M("");
      } else {
        const company = data.organizations.find(
          (o) => o.kind === "manufacturer",
        );
        if (!company) throw Error(copy(locale, "message1"));
        const result = await setupCommand("invitation.create", undefined, {
          organizationId: company.id,
          email: value,
          role,
        });
        U(location.origin + result.invitationUrl);
        await refresh();
      }
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  return (
    <section
      className="preparation-panel panel"
      style={{ padding: 16, marginBottom: 16 }}
    >
      <strong>{copy(locale, "message2")}</strong>
      <p className="muted" style={{ margin: "8px 0" }}>
        {" "}
        {copy(locale, "message3")}
      </p>
      <div className="action-group">
        {!data.organizations.some((o) => o.kind === "manufacturer") &&
          data.user.role === "admin" && (
            <button type="button" className="btn" onClick={() => M("company")}>
              {copy(locale, "message4")}
            </button>
          )}
        <button
          type="button"
          className="btn"
          onClick={() => {
            M("client");
            V("");
            U("");
          }}
        >
          {copy(locale, "message5")}
        </button>
        {data.user.role === "admin" && (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                M("invite");
                R("designer");
                V("");
                U("");
              }}
            >
              {copy(locale, "message6")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                M("invite");
                R("prepress");
                V("");
                U("");
              }}
            >
              {copy(locale, "message7")}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => void refresh().catch((e) => E(e.message))}
        >
          <RefreshCw size={14} />
          {copy(locale, "message8")}
        </button>
      </div>
      {mode && (
        <div
          className="panel"
          style={{ padding: 16, marginTop: 12 }}
          role="group"
          aria-label={copy(locale, "message9")}
        >
          {mode !== "company" && (
            <label>
              {mode === "client" ? copy(locale, "message10") : "Email"}
              <input
                type={mode === "client" ? "text" : "email"}
                value={value}
                onChange={(e) => V(e.target.value)}
              />
            </label>
          )}
          {mode === "company" && <p>{copy(locale, "message11")}</p>}
          <div className="action-group" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                M("");
                U("");
              }}
            >
              {copy(locale, "message12")}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || (mode !== "company" && !value.trim())}
              onClick={() => void save()}
            >
              {busy ? copy(locale, "message13") : copy(locale, "message14")}
            </button>
          </div>
          {url && (
            <div
              className="alert info"
              style={{ display: "block", marginTop: 12 }}
            >
              <p>{copy(locale, "message15")}</p>
              <input
                readOnly
                aria-label="Ссылка приглашения"
                value={url}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export default function SetupWizard({
  data,
  locale,
  onRefresh,
  onCreateProject,
}: {
  data: State;
  locale: Locale;
  onRefresh: () => Promise<void> | void;
  onCreateProject: () => void;
}) {
  const [step, S] = useState(0);
  const [local, D] = useState(data);
  const kz = locale === "kz";
  const checks = [
    local.organizations.some((o) => o.kind === "manufacturer"),
    local.organizations.some((o) => o.kind === "client"),
    local.profiles.some((p) => p.active && p.role === "designer"),
    local.profiles.some((p) => p.active && p.role === "prepress"),
    local.projects.length > 0,
  ];
  const [refreshError, setRefreshError] = useState("");
  async function refreshAll() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const next = await r.json();
      if (!r.ok) throw Error(next.error);
      D(next);
      await onRefresh();
      setRefreshError("");
    } catch (e) {
      setRefreshError((e as Error).message);
    }
  }
  const labels = setupSteps[locale];
  return (
    <section
      className="setup-wizard panel"
      style={{ padding: 24, marginBottom: 24 }}
    >
      <div className="eyebrow">PACKAPPROVE / START</div>
      <h2>{copy(locale, "message16")}</h2>
      <p className="muted" style={{ margin: "12px 0" }}>
        {copy(locale, "message17")}
      </p>
      <ol
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: 0,
          listStyle: "none",
        }}
      >
        {labels.map((label, i) => (
          <li key={label}>
            <button
              className="btn"
              onClick={() => S(i)}
              aria-current={step === i ? "step" : undefined}
            >
              {checks[i] ? <Check size={15} /> : i + 1} {label}
            </button>
          </li>
        ))}
      </ol>
      <h3 style={{ margin: "20px 0" }}>{labels[step]}</h3>
      {step < 4 ? (
        <PreparationPanel
          data={local}
          locale={locale}
          onChanged={(s) => {
            D(s);
            void onRefresh();
          }}
        />
      ) : (
        <>
          <p className="muted">
            {checks.slice(0, 4).every(Boolean)
              ? copy(locale, "message18")
              : copy(locale, "message19")}
          </p>
          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            disabled={!checks.slice(0, 4).every(Boolean)}
            onClick={onCreateProject}
          >
            {copy(locale, "message20")}
          </button>
        </>
      )}
      {refreshError && (
        <p className="error" role="alert">
          {refreshError}
        </p>
      )}
      <div className="action-group" style={{ marginTop: 18 }}>
        <button
          className="btn"
          disabled={step === 0}
          onClick={() => S(step - 1)}
        >
          <ArrowLeft size={14} />
          {copy(locale, "message21")}
        </button>
        <button className="btn" onClick={() => void refreshAll()}>
          <RefreshCw size={14} />
          {copy(locale, "message8")}
        </button>
        <button
          className="btn"
          disabled={step === 4}
          onClick={() => S(step + 1)}
        >
          {copy(locale, "message22")}
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
