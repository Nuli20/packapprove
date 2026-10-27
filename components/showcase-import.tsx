"use client";
import { useModalFocus } from "./use-modal-focus";
import { useState, type ReactNode } from "react";
import type { State, Row } from "./workspace";
import designs from "../public/showcase/manifest.json";
export default function ShowcaseImport({
  locale,
  onSubmit,
}: {
  locale: string;
  onSubmit: (p: Row) => Promise<unknown>;
}) {
  const [open, O] = useState(false),
    [setup, S] = useState<State | null>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const kz = locale === "kz";
  async function begin() {
    O(true);
    E("");
    try {
      const r = await fetch("/api/state?view=setup", { cache: "no-store" });
      if (!r.ok)
        throw Error(
          kz
            ? "Деректер қолжетімсіз"
            : "Не удалось загрузить команду. Обновите сессию.",
        );
      S(await r.json());
    } catch (e) {
      E((e as Error).message);
    }
  }
  return (
    <>
      <button className="btn" onClick={begin}>
        {kz ? "Демо жобаларды қосу" : "Добавить демо-проекты"}
      </button>
      {open && (
        <FocusedDialog
          onClose={() => O(false)}
          busy={busy}
          label={kz ? "Демо жобалар" : "Демонстрационные проекты"}
        >
          <h2>{kz ? "Алты сусын концепциясы" : "Шесть концепций напитков"}</h2>
          <p role="note">
            {kz
              ? "DEMO — NOT FOR PRODUCTION. Клиент шешімдері жасалмайды."
              : "DEMO — NOT FOR PRODUCTION. Это учебные концепции, не файлы для тиража. Клиентские решения и техническая готовность не создаются."}
          </p>
          <div className="showcase-selection">
            {designs.map((d) => (
              <figure key={d.id}>
                <img src={d.url} alt={d.brand} />
                <figcaption>
                  {d.brand} · {d.volumeMl} мл
                </figcaption>
              </figure>
            ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {setup ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const f = new FormData(e.currentTarget);
                B(true);
                E("");
                try {
                  await onSubmit({
                    confirmed: true,
                    designerId: f.get("designerId"),
                    prepressId: f.get("prepressId"),
                  });
                  O(false);
                } catch (e) {
                  E((e as Error).message);
                } finally {
                  B(false);
                }
              }}
            >
              {(["designer", "prepress"] as const).map((role) => (
                <label key={role}>
                  {role === "designer"
                    ? kz
                      ? "Дизайнер"
                      : "Дизайнер"
                    : kz
                      ? "Баспаға дайындау"
                      : "Допечатная подготовка"}
                  <select name={role + "Id"} required disabled={busy}>
                    <option value="">
                      {kz ? "Қызметкерді таңдаңыз" : "Выберите сотрудника"}
                    </option>
                    {setup.profiles
                      .filter(
                        (p) =>
                          p.active &&
                          p.role === role &&
                          setup.memberships.some(
                            (m) =>
                              m.user_id === p.id &&
                              setup.organizations.some(
                                (o) =>
                                  o.id === m.organization_id &&
                                  o.kind === "manufacturer",
                              ),
                          ),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <p>
                {kz
                  ? "Команда бос болса, баптауларда қызметкерді шақырыңыз."
                  : "Если список пуст, пригласите сотрудников в разделе «Настройки», затем откройте импорт повторно."}{" "}
                <a href="/?view=settings">
                  {kz ? "Баптаулар" : "Открыть настройки"}
                </a>
              </p>
              <label>
                <input type="checkbox" required disabled={busy} />
                {kz
                  ? "Демонстрациялық деректерді қосуды растаймын"
                  : "Подтверждаю добавление демонстрационных данных"}
              </label>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => O(false)}
                >
                  {kz ? "Бас тарту" : "Отмена"}
                </button>
                <button className="btn primary" disabled={busy}>
                  {busy
                    ? kz
                      ? "Қосылуда…"
                      : "Импортируем…"
                    : kz
                      ? "Алты жобаны қосу"
                      : "Добавить шесть проектов"}
                </button>
              </div>
            </form>
          ) : (
            <button className="btn" onClick={() => O(false)}>
              {kz ? "Жабу" : "Закрыть"}
            </button>
          )}
        </FocusedDialog>
      )}
    </>
  );
}

function FocusedDialog({
  children,
  onClose,
  busy,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
  label: string;
}) {
  const ref = useModalFocus(onClose, busy);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        className="modal showcase-import"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </section>
    </div>
  );
}
