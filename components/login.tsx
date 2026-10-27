"use client";
import { useState, useEffect } from "react";
import { notifySessionChange } from "@/lib/session-events";
import { ArrowRight, Box, Loader2 } from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
export default function Login({ demo }: { demo: boolean }) {
  const [locale, L] = useState<Locale>("ru");
  const t = (k: string) => translate(locale, k);
  const [email, E] = useState("");
  const [password, P] = useState("");
  const [busy, B] = useState(false);
  const [error, X] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionChanged, SC] = useState(false);
  useEffect(() => {
    SC(
      new URLSearchParams(location.search).get("reason") === "session-changed",
    );
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
      notifySessionChange("login");
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
                  <stop stopColor="#d8dfdc" />
                  <stop offset=".28" stopColor="#ffffff" />
                  <stop offset=".65" stopColor="#a9b7b4" />
                  <stop offset="1" stopColor="#e0e4de" />
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
                strokeWidth="3"
              />
              <ellipse cx="130" cy="50" rx="42" ry="8" fill="#b5c3be" />
              <ellipse
                cx="134"
                cy="49"
                rx="13"
                ry="4"
                fill="none"
                stroke="#e8eeea"
                strokeWidth="4"
              />
              <text
                x="130"
                y="168"
                fill="#edf1e2"
                fontFamily="sans-serif"
                fontSize="25"
                textAnchor="middle"
                letterSpacing="4"
              >
                Q / P
              </text>
              <text
                x="130"
                y="195"
                fill="#c8ded1"
                fontFamily="sans-serif"
                fontSize="7"
                textAnchor="middle"
                letterSpacing="2"
              >
                ALUMINIUM STUDIES
              </text>
              <path
                d="M62 223Q115 180 196 223"
                fill="none"
                stroke="#e8a270"
                strokeWidth="11"
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
          <p>
            {locale === "ru"
              ? "Войдите, чтобы продолжить работу с заказами."
              : "Тапсырыстармен жұмысты жалғастыру үшін кіріңіз."}
          </p>
          {sessionChanged && (
            <p className="alert warning" role="status">
              {locale === "ru"
                ? "Аккаунт изменён в другой вкладке. Войдите снова, чтобы продолжить."
                : "Аккаунт басқа қойындыда өзгертілді. Жалғастыру үшін қайта кіріңіз."}
            </p>
          )}
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
            <a className="demo-entry-link" href="/demo">
              {locale === "ru"
                ? "Посмотреть демо-кабинеты"
                : "Демо кабинеттерді көру"}
              <ArrowRight size={16} />
            </a>
          )}
        </form>
      </section>
    </main>
  );
}
