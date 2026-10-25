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
          <a className="can-entry" href="/can-lab">
            <svg viewBox="0 0 260 320" aria-hidden="true">
              <defs>
                <linearGradient id="aluminium">
                  <stop stop-color="#d8dfdc" />
                  <stop offset=".28" stop-color="#ffffff" />
                  <stop offset=".65" stop-color="#a9b7b4" />
                  <stop offset="1" stop-color="#e0e4de" />
                </linearGradient>
              </defs>
              <path
                d="M77 50Q70 53 67 77L62 270Q62 287 130 289Q198 287 198 270L193 77Q190 53 183 50Z"
                fill="url(#aluminium)"
              />
              <path d="M65 100H195V254Q130 272 63 254Z" fill="#326d7c" />
              <ellipse
                cx="130"
                cy="50"
                rx="53"
                ry="13"
                fill="#d7dfdb"
                stroke="#9aa9a5"
                stroke-width="3"
              />
              <ellipse cx="130" cy="50" rx="42" ry="8" fill="#b5c3be" />
              <ellipse
                cx="134"
                cy="49"
                rx="13"
                ry="4"
                fill="none"
                stroke="#e8eeea"
                stroke-width="4"
              />
              <text
                x="130"
                y="168"
                fill="#edf1e2"
                font-family="sans-serif"
                font-size="25"
                text-anchor="middle"
                letter-spacing="4"
              >
                Q / P
              </text>
              <text
                x="130"
                y="195"
                fill="#c8ded1"
                font-family="sans-serif"
                font-size="7"
                text-anchor="middle"
                letter-spacing="2"
              >
                ALUMINIUM STUDIES
              </text>
              <path
                d="M62 223Q115 180 196 223"
                fill="none"
                stroke="#e8a270"
                stroke-width="11"
              />
            </svg>
            <span>
              {locale === "ru" ? "Исследовать 3D-банку" : "3D құтыны зерттеу"}{" "}
              <ArrowRight size={16} />
            </span>
            <small>STANDARD 450 / SLEEK 330 / SLIM 250</small>
          </a>
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
