"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { translate, type Locale } from "@/lib/i18n";
import { Box, Loader2, ArrowRight, Check } from "lucide-react";
type Info = { email: string; role: string; organization: string };
export default function Invite() {
  const [info, I] = useState<Info>(),
    [error, E] = useState(""),
    [token, T] = useState(""),
    [locale, L] = useState<Locale>("ru"),
    [busy, B] = useState(false),
    [loading, LD] = useState(true);
  const tokenRef = useRef("");
  const t = (k: string) => translate(locale, k),
    kz = locale === "kz";
  useEffect(() => {
    let dead = false;
    const url = new URL(location.href);
    const token =
      tokenRef.current ||
      new URLSearchParams(url.hash.slice(1)).get("token") ||
      url.searchParams.get("token") ||
      "";
    tokenRef.current = token;
    T(token);
    // New links use fragments: they never enter HTTP access logs or Referer headers.
    // Strip legacy query capabilities as soon as the browser reads them as well.
    history.replaceState(history.state, "", "/invite");
    fetch("/api/invitations/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        if (!dead) I(j);
      })
      .catch((e) => {
        if (!dead) E(e.message);
      })
      .finally(() => {
        if (!dead) LD(false);
      });
    return () => {
      dead = true;
    };
  }, []);
  async function accept(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    B(true);
    E("");
    const f = new FormData(e.currentTarget);
    try {
      if (f.get("password") !== f.get("confirm"))
        throw Error(kz ? "Құпиясөздер сәйкес емес" : "Пароли не совпадают");
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
    <main className="invitation-page">
      <section className="invitation-card">
        <div className="invitation-brand">
          <Box size={24} />
          <b>PackApprove</b>
          <button
            type="button"
            className="text-btn"
            onClick={() => L(kz ? "ru" : "kz")}
          >
            RU / KZ
          </button>
        </div>
        <span className="eyebrow">
          QAZALPACK / {kz ? "КОМАНДАҒА ШАҚЫРУ" : "ПРИГЛАШЕНИЕ В КОМАНДУ"}
        </span>
        <h1>{kz ? "Бірге жұмыс істейік" : "Начнём работу вместе"}</h1>
        {loading && (
          <p role="status">
            <Loader2 className="spin" size={18} />{" "}
            {kz ? "Шақыру тексерілуде…" : "Проверяем приглашение…"}
          </p>
        )}
        {info && (
          <div className="invitation-summary">
            <span className="invitation-check">
              <Check size={20} />
            </span>
            <div>
              <b>{info.organization}</b>
              <p>{info.email}</p>
              <span className="badge">{t(info.role)}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {info && (
          <form className="invitation-form" onSubmit={accept}>
            <label>
              {t("fullName")}
              <input
                name="fullName"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                disabled={busy}
              />
            </label>
            <label>
              {t("password")}
              <input
                type="password"
                name="password"
                aria-label={t("password")}
                aria-describedby="invitation-password-hint"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                disabled={busy}
              />
              <small id="invitation-password-hint">
                {kz ? "Кемінде 12 таңба" : "Не менее 12 символов"}
              </small>
            </label>
            <label>
              {kz ? "Құпиясөзді қайталаңыз" : "Повторите пароль"}
              <input
                type="password"
                name="confirm"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                disabled={busy}
              />
            </label>
            <button className="btn primary wide" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <>
                  {t("acceptInvite")}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}
        {!loading && (
          <p className="invitation-login">
            {kz ? "Аккаунт бар ма?" : "Уже есть аккаунт?"}{" "}
            <Link href="/login">{kz ? "Кіру" : "Войти"}</Link>
          </p>
        )}
      </section>
    </main>
  );
}
