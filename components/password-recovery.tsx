"use client";
import { useEffect, useState } from "react";
export default function PasswordRecovery({
  reset = false,
}: {
  reset?: boolean;
}) {
  const [busy, B] = useState(false),
    [error, E] = useState(""),
    [sent, S] = useState(false),
    [locale, L] = useState<"ru" | "kz">("ru");
  useEffect(() => {
    if (new URLSearchParams(location.search).has("expired"))
      E(
        "Ссылка истекла, уже использована или открыта в другом браузере. Запросите новую ссылку.",
      );
  }, []);
  const kz = locale === "kz";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    E("");
    B(true);
    const form = new FormData(event.currentTarget);
    if (reset && form.get("password") !== form.get("confirm")) {
      E(kz ? "Құпиясөздер сәйкес емес" : "Пароли не совпадают");
      B(false);
      return;
    }
    try {
      const response = await fetch(
        reset ? "/api/auth/password" : "/api/auth/recover",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reset
              ? { password: form.get("password") }
              : { email: form.get("email") },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      S(true);
    } catch (e) {
      E((e as Error).message);
    } finally {
      B(false);
    }
  }
  return (
    <main className="loading-screen">
      <section
        className="panel info-panel"
        style={{ width: "min(92vw,460px)", padding: 30 }}
      >
        <div className="panel-heading">
          <b>PackApprove</b>
          <button onClick={() => L(kz ? "ru" : "kz")}>RU / KZ</button>
        </div>
        <h1 style={{ fontSize: 26 }}>
          {reset
            ? kz
              ? "Жаңа құпиясөз"
              : "Новый пароль"
            : kz
              ? "Құпиясөзді қалпына келтіру"
              : "Восстановление пароля"}
        </h1>
        <p style={{ margin: "18px 0", lineHeight: 1.6 }}>
          {reset
            ? kz
              ? "Кемінде 12 таңба қолданыңыз."
              : "Используйте не менее 12 символов. Профиль, роль и проекты сохранятся."
            : kz
              ? "Тіркелгі поштасын енгізіңіз. Хаттағы сілтемені осы браузерде ашыңыз."
              : "Введите почту аккаунта. Ссылку из письма откройте в этом же браузере."}
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {sent ? (
          <div role="status" className="alert info">
            {reset
              ? kz
                ? "Құпиясөз өзгертілді."
                : "Пароль изменён. Можно вернуться в рабочее пространство."
              : kz
                ? "Тіркелгі бар болса, қалпына келтіру хатын тексеріңіз."
                : "Если аккаунт существует, проверьте почту и папку «Спам». Доставка зависит от почтовой настройки Supabase."}
          </div>
        ) : (
          <form onSubmit={submit} className="modal-form">
            {reset ? (
              <>
                <label>
                  {kz ? "Жаңа құпиясөз" : "Новый пароль"}
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                <label>
                  {kz ? "Құпиясөзді қайталаңыз" : "Повторите пароль"}
                  <input
                    type="password"
                    name="confirm"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
              </>
            ) : (
              <label>
                {kz ? "Электрондық пошта" : "Электронная почта"}
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            <button className="btn primary wide" disabled={busy}>
              {busy
                ? kz
                  ? "Күтіңіз…"
                  : "Подождите…"
                : reset
                  ? kz
                    ? "Құпиясөзді сақтау"
                    : "Сохранить пароль"
                  : kz
                    ? "Сілтеме сұрау"
                    : "Запросить ссылку"}
            </button>
          </form>
        )}
        <p style={{ marginTop: 24 }}>
          <a className="text-btn" href={sent && reset ? "/" : "/login"}>
            {kz ? "Кіруге оралу" : "Вернуться ко входу"}
          </a>
        </p>
      </section>
    </main>
  );
}
