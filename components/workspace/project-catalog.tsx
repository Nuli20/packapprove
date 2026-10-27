"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { WorkspaceState } from "@/lib/models";
import { translate, type Locale } from "@/lib/i18n";
import { Button, EmptyState, Status } from "../ui";
import { FileCover } from "./file-cover";
export type CatalogFilters = {
  organization: string;
  status: string;
  sort: string;
};
export default function ProjectCatalog({
  data: d,
  locale,
  onProject,
  search,
  onSearch,
  filters,
  onFilters,
}: {
  data: WorkspaceState;
  locale: Locale;
  onProject: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  filters: CatalogFilters;
  onFilters: (filters: CatalogFilters) => void;
}) {
  const [layout, L] = useState("cards"),
    [showFilters, F] = useState(false);
  const t = (k: string) => translate(locale, k),
    kz = locale === "kz";
  const date = (v: string) =>
    new Date(v).toLocaleDateString(kz ? "kk-KZ" : "ru-RU", {
      day: "numeric",
      month: "short",
    });
  return (
    <>
      <div className="catalog-toolbar">
        <label className="catalog-search">
          <Search size={18} />
          <span className="sr-only">{t("search")}</span>
          <input
            value={search}
            placeholder={
              kz
                ? "Жоба немесе клиент бойынша іздеу"
                : "Поиск по проекту или клиенту"
            }
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
        <Button onClick={() => F(!showFilters)} aria-expanded={showFilters}>
          <SlidersHorizontal size={17} />
          {kz ? "Сүзгілер" : "Фильтры"}
        </Button>
        <div className="view-toggle">
          <Button
            aria-label={t("cards")}
            aria-pressed={layout === "cards"}
            onClick={() => L("cards")}
          >
            <LayoutGrid size={17} />
          </Button>
          <Button
            aria-label={t("table")}
            aria-pressed={layout === "table"}
            onClick={() => L("table")}
          >
            <List size={17} />
          </Button>
        </div>
      </div>
      {showFilters && (
        <div className="catalog-filters panel">
          <label>
            {t("organization")}
            <select
              value={filters.organization}
              onChange={(e) =>
                onFilters({ ...filters, organization: e.target.value })
              }
            >
              <option value="">{t("all")}</option>
              {d.organizations
                .filter((o) => o.kind === "client")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("status")}
            <select
              value={filters.status}
              onChange={(e) =>
                onFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">{t("all")}</option>
              {["active", "paused", "completed", "archived"].map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("sort")}
            <select
              value={filters.sort}
              onChange={(e) => onFilters({ ...filters, sort: e.target.value })}
            >
              {["deadline", "name", "created_at"].map((s) => (
                <option key={s} value={s}>
                  {t(s === "created_at" ? "date" : s)}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() =>
              onFilters({ organization: "", status: "", sort: "deadline" })
            }
          >
            {kz ? "Тазарту" : "Сбросить"}
          </Button>
        </div>
      )}
      <div className="catalog-caption">
        <span>
          {kz ? "Табылды" : "Найдено"}:{" "}
          <b>{d.pagination?.total ?? d.projects.length}</b>
        </span>
        <span>
          {kz ? "Алюминий қаптамасының дизайны" : "Дизайн алюминиевой упаковки"}
        </span>
      </div>
      {layout === "cards" ? (
        <div className="project-catalog-grid">
          {d.projects.map((p) => {
            const a = d.artworks.find((a) => a.project_id === p.id),
              versions = d.versions.filter((v) =>
                d.artworks.some(
                  (a) => a.project_id === p.id && a.id === v.artwork_id,
                ),
              );
            return (
              <article
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && e.key === "Enter")
                    onProject(p.id);
                }}
                className="project-studio-card panel"
                key={p.id}
                onClick={() => onProject(p.id)}
              >
                <div className="project-visual">
                  {a ? (
                    <FileCover data={d} artwork={a} />
                  ) : (
                    <span className="cover-placeholder">—</span>
                  )}
                  <span className="project-visual-count">
                    {p.artwork_count ??
                      d.artworks.filter((a) => a.project_id === p.id)
                        .length}{" "}
                    {t("artworks").toLowerCase()}
                  </span>
                  <span className="project-open">
                    <ArrowUpRight size={20} />
                  </span>
                </div>
                <div className="project-card-body">
                  <div className="project-card-kicker">
                    <span>{p.organization_name}</span>
                    <Status status={p.status} label={t(p.status)} />
                  </div>
                  <h2>{p.name}</h2>
                  <small>
                    {
                      d.profiles.find((person) => person.id === p.designer_id)
                        ?.full_name
                    }{" "}
                    · {a?.packaging_type}
                  </small>
                  {a && (
                    <a
                      className="text-btn"
                      href={`/?artwork=${a.id}&mode=3d`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {kz ? "Нұсқа және 3D" : "Открыть версию в 3D"} ↗
                    </a>
                  )}
                  <p>
                    {p.customer_order ||
                      p.description ||
                      (kz ? "Жаңа өндірістік жоба" : "Производственный проект")}
                  </p>
                  <div className="project-card-footer">
                    <span>
                      <CalendarDays size={15} />
                      {date(p.deadline)}
                    </span>
                    <span>
                      {versions.length
                        ? `V${Math.max(...versions.map((v) => v.number))}`
                        : kz
                          ? "Файл күтілуде"
                          : "Ожидает файла"}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel project-table-wrap">
          <table className="project-table">
            <thead>
              <tr>
                {["project", "artworks", "deadline", "manager", "status"].map(
                  (k) => (
                    <th key={k}>{t(k)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {d.projects.map((p) => (
                <tr
                  key={p.id}
                  tabIndex={0}
                  onClick={() => onProject(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onProject(p.id);
                  }}
                >
                  <td>
                    <b>{p.name}</b>
                    <small>{p.organization_name}</small>
                  </td>
                  <td>
                    {p.artwork_count ??
                      d.artworks.filter((a) => a.project_id === p.id).length}
                  </td>
                  <td>{date(p.deadline)}</td>
                  <td>
                    {d.profiles.find((pr) => pr.id === p.manager_id)
                      ?.full_name || "—"}
                  </td>
                  <td>
                    <Status status={p.status} label={t(p.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!d.projects.length && <EmptyState title={t("emptyProjects")} />}
    </>
  );
}
