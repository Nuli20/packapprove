"use client";
import type { WorkspaceState } from "@/lib/models";
import { translate, type Locale } from "@/lib/i18n";
import { Panel, PageHeading, EmptyState } from "../ui";
export default function Reports({
  data: d,
  locale,
}: {
  data: WorkspaceState;
  locale: Locale;
}) {
  const t = (k: string) => translate(locale, k),
    r = d.report;
  return (
    <>
      <PageHeading title={t("reports")} description={t("reportDuration")} />
      {!r ? (
        <EmptyState title={t("empty")} />
      ) : (
        <>
          <div className="overview-metrics">
            {[
              [t("reportDuration"), r.hours.toFixed(1) + " " + t("hours")],
              [t("roundCount"), r.rounds],
              [t("versionCount"), r.versions],
              [t("pendingReceive"), d.metrics?.pendingReceive || 0],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <p className="report-note">
            {locale === "ru"
              ? `Заменённые раунды: ${r.replaced}. Отменённые: ${r.cancelled}. Они не входят в среднее время решения.`
              : `Ауыстырылған кезеңдер: ${r.replaced}. Бас тартылған: ${r.cancelled}. Олар орташа шешім уақытына қосылмайды.`}
          </p>
          <div className="report-grid">
            <Panel className="info-panel">
              <h2>{t("workload")}</h2>
              {r.workload.map((p) => (
                <div className="report-line" key={p.id}>
                  <span>{p.full_name}</span>
                  <b>{p.count}</b>
                </div>
              ))}
            </Panel>
            <Panel className="info-panel">
              <h2>{t("overdue")}</h2>
              {r.overdue.length ? (
                r.overdue.map((o) => (
                  <div className="report-line" key={o.id}>
                    <span>{o.name}</span>
                    <b>{o.count}</b>
                  </div>
                ))
              ) : (
                <p className="muted">{t("empty")}</p>
              )}
            </Panel>
          </div>
          <Panel className="info-panel">
            <h2>{t("packages")}</h2>
            <p className="muted">
              {locale === "ru"
                ? "Последние 12 передач. Полная история — в производственных комплектах."
                : "Соңғы 12 беру. Толық тарих өндірістік жинақтарда."}
            </p>
            {d.packages.map((p) => (
              <div className="history-row" key={p.id}>
                <b>{p.number}</b>
                <span>
                  {d.projects.find((pr) => pr.id === p.project_id)?.name}
                </span>
                <span className={`badge ${p.status}`}>{t(p.status)}</span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </>
  );
}
