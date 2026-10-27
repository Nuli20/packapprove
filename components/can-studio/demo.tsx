"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import originals from "@/public/can-demos/manifest.json";
import showcase from "@/public/showcase/manifest.json";
const demos = [...originals, ...showcase];
import type { Locale } from "@/lib/i18n";
import { DEFAULT_CAN_SPEC } from "@/lib/can-spec";
import type { CanPreset } from "@/lib/can-spec";
import PdfViewer from "../pdf-viewer";
const Studio = dynamic(() => import("./studio"), {
  ssr: false,
  loading: () => <div className="empty">Can Studio…</div>,
});
export default function DemoCanStudio() {
  const [index, I] = useState(0);
  const [locale, L] = useState<Locale>("ru");
  const [mode, M] = useState("3d");
  const d = demos[index];
  return (
    <main className="can-lab-page">
      <header className="can-lab-header">
        <div>
          <div className="eyebrow">PACKAPPROVE / ALUMINIUM EXPERIENCE</div>
          <h1>
            {locale === "ru"
              ? "Студия алюминиевой банки"
              : "Алюминий құты студиясы"}
          </h1>
          <p>
            {locale === "ru"
              ? "Выберите дизайн и рассмотрите его на трёх форматах банки."
              : "Дизайнды таңдап, оны құтының үш форматында қараңыз."}
          </p>
        </div>
        <div className="action-group">
          <button
            className="btn"
            onClick={() => L(locale === "ru" ? "kz" : "ru")}
          >
            RU / KZ
          </button>
          <Link className="btn" href="/">
            {locale === "ru" ? "Рабочий кабинет" : "Жұмыс кабинеті"}
          </Link>
        </div>
      </header>
      <nav className="can-demo-tabs" aria-label="Демонстрационные форматы">
        {demos.map((x, i) => (
          <button
            key={x.id}
            aria-pressed={i === index}
            onClick={() => {
              I(i);
              M("3d");
            }}
          >
            <b>
              {x.brand} / {x.volumeMl} ML
            </b>
            <small>{x.name}</small>
          </button>
        ))}
      </nav>
      <div
        className="action-group"
        aria-label={locale === "ru" ? "Режим просмотра" : "Көру режимі"}
        style={{ marginBottom: 16 }}
      >
        <button
          className="btn"
          aria-pressed={mode === "3d"}
          onClick={() => M("3d")}
        >
          3D
        </button>
        <button
          className="btn"
          aria-pressed={mode === "2d"}
          onClick={() => M("2d")}
        >
          {locale === "ru" ? "2D-развёртка" : "2D жайма"}
        </button>
        {"slug" in d && (
          <a className="btn" href={`/showcase/${d.slug}-v1.pdf`} download>
            PDF · DEMO
          </a>
        )}
      </div>
      <div className="can-demo-content">
        <div>
          {mode === "3d" ? (
            <Studio
              key={d.id}
              demo
              file={d}
              version={{ id: d.id, number: 1 }}
              savedSpec={{ ...DEFAULT_CAN_SPEC, preset: d.preset as CanPreset }}
              locale={locale}
              role="observer"
              onFallback={() => M("2d")}
            />
          ) : (
            <section className="panel info-panel">
              <button className="btn" onClick={() => M("3d")}>
                3D
              </button>
              {d.mime_type === "application/pdf" ? (
                <PdfViewer url={d.url} zoom={0.5} page={1} />
              ) : (
                <img style={{ width: "100%" }} src={d.url} alt={d.name} />
              )}
            </section>
          )}
        </div>
        <aside className="panel can-demo-info">
          <span className="eyebrow">ORIGINAL DEMO / 0{index + 1}</span>
          <h2>
            {d.brand}
            <br />
            {d.name}
          </h2>
          <p>
            {locale === "ru"
              ? "Это вымышленный бренд и отдельный демонстрационный материал. Клиентские файлы сюда не попадают."
              : "Бұл ойдан шығарылған бренд және бөлек демонстрациялық материал. Клиент файлдары мұнда түспейді."}
          </p>
          <img
            src={
              d.mime_type === "image/png" ? d.url : `/can-demos/${d.preset}.png`
            }
            alt={d.name}
          />
          <p>
            {locale === "ru"
              ? "Геометрия приблизительная. Номинальный объём — обозначение формата, не результат расчёта. Точные шаблоны завода и цветопроба потребуются перед производством."
              : "Геометрия жуық. Номиналды көлем — есептеу нәтижесі емес. Өндіріс алдында зауыт үлгілері мен түстік сынама қажет."}
          </p>
          <a className="text-btn" href={d.url} download>
            {locale === "ru"
              ? "Скачать демонстрационную развёртку"
              : "Демонстрациялық жайманы жүктеу"}
          </a>
        </aside>
      </div>
    </main>
  );
}
