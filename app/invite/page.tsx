"use client";
import { useEffect, useState } from "react";
import { translate, type Locale } from "@/lib/i18n";
import { Box, Loader2 } from "lucide-react";
export default function Invite() {
  const [info, I] = useState<any>();
  const [error, E] = useState("");
  const [token, T] = useState("");
  const [locale, L] = useState<Locale>("ru");
  const [busy, B] = useState(false);
  const t = (k: string) => translate(locale, k);
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token") || "";
    T(token);
    fetch("/api/invitations/info?token=" + token)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        I(j);
      })
      .catch((e) => E(e.message));
  }, []);
  async function accept(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    B(true);
    E("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          fullName: f.get("fullName"),
          password: f.get("password"),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      location.href = "/";
    } catch (e) {
      E((e as Error).message);
      B(false);
    }
  }
  return (
    <div className="loading-screen">
      <div
        className="panel info-panel"
        style={{ width: "min(92vw,440px)", padding: 30 }}
      >
        <div className="panel-heading">
          <Box />
          <b>PackApprove</b>
          <button onClick={() => L(locale === "ru" ? "kz" : "ru")}>
            RU / KZ
          </button>
        </div>
        <h2>{t("acceptInvite")}</h2>
        {info && (
          <p style={{ margin: "15px 0" }}>
            {info.organization} · {info.email} · {t(info.role)}
          </p>
        )}
        {error && <div className="alert error">{error}</div>}
        {info && (
          <form className="modal-form" onSubmit={accept}>
            <label>
              {t("fullName")}
              <input name="fullName" required minLength={2} maxLength={100} />
            </label>
            <label>
              {t("password")}
              <input
                type="password"
                name="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? <Loader2 className="spin" /> : t("acceptInvite")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
