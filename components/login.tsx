"use client";
import { useState } from "react";
import {
  ArrowRight,
  Box,
  ShieldCheck,
  Layers,
  Check,
  Loader2,
} from "lucide-react";
import { translate, type Locale } from "@/lib/i18n";
export default function Login({ demo }: { demo: boolean }) {
  const [locale, L] = useState<Locale>("ru");
  const t = (k: string) => translate(locale, k);
  const [email, E] = useState(demo ? "manager@packapprove.local" : "");
  const [password, P] = useState(demo ? "PackApprove2026!" : "");
  const [busy, B] = useState(false);
  const [error, X] = useState("");
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
          <div className="eyebrow">QAZALPACK · DIGITAL WORKSPACE</div>
          <h1>{t("loginSubtitle")}</h1>
          <p>{t("subtitle")}</p>
          <div className="package-illustration">
            <div className="mock-box">
              <div className="box-mark">Q</div>
              <small>QAZALPACK</small>
              <strong>
                DESIGNED
                <br />
                TO BE
                <br />
                APPROVED.
              </strong>
              <span>PACKAGING COLLECTION / 2026</span>
            </div>
            <div className="float-label">
              <ShieldCheck size={20} />
              <span>
                SHA-256{" "}
                <b>
                  <Check size={14} />
                </b>
              </span>
            </div>
            <div className="float-version">
              <Layers size={18} /> V3 <span>{t("approved")}</span>
            </div>
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
          <span className="eyebrow">PACKAPPROVE</span>
          <h2>{t("login")}</h2>
          <p>{t("brand")}</p>
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
            <div className="demo-accounts">
              <small>{t("demo")}</small>
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
            </div>
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
