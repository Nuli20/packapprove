"use client";
import { useState } from "react";
import type { Row, State } from "./workspace";
import { translate, type Locale } from "@/lib/i18n";
import { setupCopy as copy } from "@/lib/setup-copy";
import { useSetupCommand } from "./use-setup-command";
export default function PeopleManagement({
  data,
  locale,
  onRefresh,
  onInvite,
  onEdit,
}: {
  data: State;
  locale: Locale;
  onRefresh: () => Promise<void> | void;
  onInvite: () => void;
  onEdit: (profile: Row) => void;
}) {
  const setupCommand = useSetupCommand();
  const t = (k: string) => translate(locale, k);
  const [link, L] = useState("");
  const [error, E] = useState("");
  const [busy, B] = useState(false);
  async function run(action: string, id: string, p: Row = {}, rv?: number) {
    B(true);
    E("");
    try {
      const r = await setupCommand(action, id, p, rv);
      if (r.invitationUrl) L(location.origin + r.invitationUrl);
      await onRefresh();
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  return (
    <section className="panel info-panel">
      <div className="panel-heading">
        <h2>{t("people")}</h2>
        <button className="btn primary" onClick={onInvite}>
          {t("invite")}
        </button>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {link && (
        <div className="alert info" style={{ display: "block" }}>
          <p>{copy(locale, "message23")}</p>
          <input
            readOnly
            value={link}
            aria-label={t("invite")}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
      <h3>{copy(locale, "message24")}</h3>
      {data.profiles.map((p) => (
        <div className="history-row" key={p.id}>
          <span>
            <b>{p.full_name}</b>
            <small>
              {" "}
              · {t(p.role === "production" ? "productionRole" : p.role)} ·{" "}
              {p.active ? copy(locale, "message25") : copy(locale, "message26")}
            </small>
            <small style={{ display: "block" }}>
              {data.memberships
                .filter((m) => m.user_id === p.id)
                .map(
                  (m) =>
                    data.organizations.find((o) => o.id === m.organization_id)
                      ?.name,
                )
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
          {data.user.role === "admin" && p.id !== data.user.id && (
            <div className="action-group">
              <button className="btn" disabled={busy} onClick={() => onEdit(p)}>
                {t("security")}
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(
                    "profile.update",
                    p.id,
                    { role: p.role, active: !p.active },
                    p.row_version,
                  )
                }
              >
                {p.active
                  ? copy(locale, "message27")
                  : copy(locale, "message28")}
              </button>
            </div>
          )}
        </div>
      ))}
      <h3 style={{ marginTop: 24 }}>{copy(locale, "message29")}</h3>
      {!data.invitations.length && (
        <p className="muted">{copy(locale, "message30")}</p>
      )}
      {data.invitations.map((i) => (
        <div className="history-row" key={i.id}>
          <span>
            <b>{i.email}</b>
            <small style={{ display: "block" }}>
              {t(i.role === "production" ? "productionRole" : i.role)} ·{" "}
              {data.organizations.find((o) => o.id === i.organization_id)?.name}
            </small>
            <small>
              {i.accepted_at
                ? copy(locale, "message31")
                : new Date(i.expires_at) < new Date()
                  ? copy(locale, "message32")
                  : copy(locale, "message33")}
            </small>
          </span>
          {!i.accepted_at &&
            (data.user.role === "admin" ||
              ["observer", "approver"].includes(i.role)) && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => void run("invitation.resend", i.id)}
              >
                {copy(locale, "message34")}
              </button>
            )}
        </div>
      ))}
    </section>
  );
}
