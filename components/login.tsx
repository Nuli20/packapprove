"use client";
import { useState, useEffect } from "react";
import { ArrowRight, Box, ShieldCheck, Loader2 } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
export default function Login({ demo }: { demo: boolean }) {
  const [locale, L] = useState<Locale>("ru");
  const t = (k: string) => translate(locale, k);
  const [email, E] = useState(demo ? "manager@packapprove.local" : "");
  const [password, P] = useState(demo ? "PackApprove2026!" : "");
  const [busy, B] = useState(false);
  const [error, X] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    setSessionExpired(
      new URLSearchParams(window.location.search).get("reason") ===
        "session-expired",
    );
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    B(true);
    X("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      location.href = "/";
    } catch (e) {
      X((e as Error).message);
      B(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Box size={25} />
          </span>
          <b>
            Pack<span>Approve</span>
          </b>
        </div>
        <div className="login-copy">
          <div className="eyebrow">PACKAGING OPERATIONS STUDIO</div>
          <h1>
            {locale === "ru" ? (
              <>
                От первого
                <br />
                штриха —<br />
                <em>до тиража.</em>
              </>
            ) : (
              <>
                Алғашқы
                <br />
                сызбадан —<br />
                <em>таралымға дейін.</em>
              </>
            )}
          </h1>
          <p>
            {locale === "ru"
              ? "Макеты, обсуждения и решения — в одном рабочем пространстве. Точная версия на каждом этапе."
              : "Макеттер, талқылаулар мен шешімдер — бір жұмыс кеңістігінде. Әр кезеңде нақты нұсқа."}
          </p>
          <div className="studio-specimen" aria-hidden="true">
            <span className="specimen-label">PA / MATERIAL STUDY</span>
            <div className="diecut-flat">
              <span className="diecut-flap top" />
              <span className="diecut-flap left" />
              <span className="diecut-flap right" />
              <span className="diecut-flap bottom" />
              <div className="diecut-face">
                <span>Q / P</span>
                <b>
                  FORM.
                  <br />
                  PRINT.
                  <br />
                  APPROVE.
                </b>
                <small>PACKAGING OPERATIONS</small>
              </div>
            </div>
            <div className="print-controls">
              <i />
              <i />
              <i />
              <i />
              <span>01 — 04 / PROCESS</span>
            </div>
            <span className="specimen-dimension">
              ARTWORK → APPROVAL → PRODUCTION
            </span>
          </div>
        </div>
        <small className="login-footer">
          © 2026 {t("company")} · PackApprove
        </small>
      </section>
      <section className="login-form-section">
        <button
          className="language"
          onClick={() => L(locale === "ru" ? "kz" : "ru")}
        >
          RU / KZ
        </button>
        <form onSubmit={login} className="login-form">
          <span className="eyebrow">QAZALPACK / WORKSPACE</span>
          <h2>{t("login")}</h2>
          <p>{t("brand")}</p>
          {sessionExpired && (
            <div className="alert warning" role="status">
              {locale === "ru"
                ? "Время сессии истекло. Войдите снова, чтобы продолжить работу."
                : "Сессия мерзімі аяқталды. Жұмысты жалғастыру үшін қайта кіріңіз."}
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <label>
            {t("email")}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => E(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            {t("password")}
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => P(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <a className="forgot-password" href="/forgot-password">
            {locale === "ru" ? "Забыли пароль?" : "Құпиясөзді ұмыттыңыз ба?"}
          </a>
          <button className="btn primary wide" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <>
                {t("login")}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          {demo && (
            <details className="demo-accounts">
              <summary>{t("demo")}</summary>
              <div>
                {[
                  "manager",
                  "designer",
                  "prepress",
                  "approver",
                  "observer",
                  "production",
                  "admin",
                  "approver2",
                  "clientb",
                ].map((role) => (
                  <button
                    type="button"
                    key={role}
                    onClick={() => {
                      E(`${role}@packapprove.local`);
                      P("PackApprove2026!");
                    }}
                  >
                    {t(role === "production" ? "productionRole" : role)}
                  </button>
                ))}
              </div>
              <code>PackApprove2026!</code>
            </details>
          )}
        </form>
        <div className="login-safe">
          <ShieldCheck size={16} />
          {t("fileIdentity")}
        </div>
      </section>
    </main>
  );
}
