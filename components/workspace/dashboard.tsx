"use client";
import {
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  FolderKanban,
  Plus,
} from "lucide-react";
import type { WorkspaceState, Artwork } from "@/lib/models";
import { translate, type Locale, eventKeys } from "@/lib/i18n";
import { operationalItems, nextBlock } from "@/lib/workflow";
import { Button, Panel, PageHeading, EmptyState, Status } from "../ui";
import { FileCover } from "./file-cover";
export default function Dashboard({
  data: d,
  locale,
  onProject,
  onArtwork,
  onGo,
  onCreate,
}: {
  data: WorkspaceState;
  locale: Locale;
  onProject: (id: string) => void;
  onArtwork: (a: Artwork) => void;
  onGo: (v: string) => void;
  onCreate: () => void;
}) {
  const t = (k: string) => translate(locale, k),
    kz = locale === "kz",
    date = (v: string) =>
      new Date(v).toLocaleDateString(kz ? "kk-KZ" : "ru-RU", {
        day: "numeric",
        month: "short",
      }),
    manage = ["admin", "manager"].includes(d.user.role),
    client = ["observer", "approver"].includes(d.user.role);
  const items = operationalItems(d),
    actions = items.filter((i) => i.mine),
    m = d.metrics || {};
  return (
    <>
      <PageHeading
        eyebrow={kz ? "ЖҰМЫС КЕҢІСТІГІ" : "РАБОЧЕЕ ПРОСТРАНСТВО"}
        title={
          client ? (kz ? "Сіздің жобаларыңыз" : "Ваши проекты") : t("overview")
        }
        description={
          client
            ? kz
              ? "Макеттерді қарап, өз нұсқаңыз бойынша шешім қабылдаңыз."
              : "Проверяйте макеты и принимайте решение по своей версии."
            : kz
              ? "Назар аударуды қажет ететін жобалар мен әрекеттер."
              : "Проекты и действия, которым сейчас нужно внимание."
        }
        action={
          manage ? (
            <Button variant="primary" onClick={onCreate}>
              <Plus size={17} />
              {t("newProject")}
            </Button>
          ) : undefined
        }
      />
      <div className="overview-metrics">
        {[
          [
            "activeProjects",
            m.activeProjects ?? d.projects.length,
            "projects",
            FolderKanban,
          ],
          ["awaiting", m.awaiting ?? 0, "approval", Clock3],
          ["approved", m.approved ?? 0, "approvedVersions", CheckCircle2],
          ["overdue", m.overdue ?? 0, "approval", Clock3],
        ].map(([label, value, view, Icon]) => {
          const Glyph = Icon as typeof Clock3;
          return (
            <button key={String(label)} onClick={() => onGo(String(view))}>
              <Glyph size={18} />
              <span>{t(String(label))}</span>
              <strong>{String(value)}</strong>
            </button>
          );
        })}
      </div>
      <div className="dashboard-columns">
        <Panel className="action-list-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {kz ? "СІЗДІҢ КЕЗЕГІҢІЗ" : "ВАШ ХОД"}
              </span>
              <h2>{t("nextActions")}</h2>
            </div>
            <Button onClick={() => onGo("tasks")}>
              {t("showAll")}
              <ArrowUpRight size={16} />
            </Button>
          </div>
          {actions.length ? (
            actions.slice(0, 6).map((i) => (
              <button
                className="action-list-row"
                key={i.a.id}
                onClick={() => onArtwork(i.a)}
              >
                <span className="action-step">
                  <Clock3 size={18} />
                </span>
                <span>
                  <b>{i.a.name}</b>
                  <small>{t(nextBlock(i))}</small>
                </span>
                <time>{date(i.deadline)}</time>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <EmptyState title={t("queueEmpty")}>
              {t("queueEmptyHelp")}
            </EmptyState>
          )}
        </Panel>
        <Panel className="activity-panel">
          <div className="panel-heading">
            <h2>{t("activity")}</h2>
          </div>
          <div className="activity-list">
            {d.notifications.slice(0, 5).map((n) => (
              <div className="activity-item" key={n.id}>
                <span className="activity-icon">
                  <Clock3 size={16} />
                </span>
                <div>
                  <b>{t(eventKeys[n.kind] || n.kind)}</b>
                  <small>{date(n.created_at)}</small>
                </div>
              </div>
            ))}
            {!d.notifications.length && <p className="muted">{t("empty")}</p>}
          </div>
        </Panel>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {kz ? "ӨНДІРІСТІК ПОРТФЕЛЬ" : "В РАБОТЕ"}
          </span>
          <h2>{t("projects")}</h2>
        </div>
        <Button onClick={() => onGo("projects")}>
          {t("allProjects")}
          <ArrowUpRight size={16} />
        </Button>
      </div>
      <div className="overview-projects">
        {d.projects.map((p) => {
          const a = d.artworks.find((a) => a.project_id === p.id);
          return (
            <button
              className="overview-project panel"
              key={p.id}
              onClick={() => onProject(p.id)}
            >
              {a && <FileCover data={d} artwork={a} />}
              <div>
                <small>{p.organization_name}</small>
                <h3>{p.name}</h3>
                <div className="project-card-footer">
                  <Status status={p.status} label={t(p.status)} />
                  <time>{date(p.deadline)}</time>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
