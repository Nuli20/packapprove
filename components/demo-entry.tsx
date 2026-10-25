"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  UsersRound,
  BriefcaseBusiness,
  Palette,
  ScanLine,
  Stamp,
  Factory,
  Loader2,
  Box,
} from "lucide-react";
import type { DemoRole } from "@/lib/demo-environment";
const roles = [
  [
    "admin",
    UsersRound,
    "Администратор",
    "Команда, заказчики и настройки",
    "Әкімші",
    "Команда, клиенттер және баптаулар",
  ],
  [
    "manager",
    BriefcaseBusiness,
    "Менеджер",
    "Заказы, сроки и передача в производство",
    "Менеджер",
    "Тапсырыстар, мерзім және өндіріске беру",
  ],
  [
    "designer",
    Palette,
    "Дизайнер",
    "Файлы, новые версии и исправления",
    "Дизайнер",
    "Файлдар, жаңа нұсқалар және түзетулер",
  ],
  [
    "prepress",
    ScanLine,
    "Допечатная подготовка",
    "Техническая очередь и чек-листы",
    "Баспаға дайындау",
    "Техникалық кезек және тексеру",
  ],
  [
    "approver",
    Stamp,
    "Клиент-согласующий",
    "2D, 3D, замечания и решения",
    "Келісуші клиент",
    "2D, 3D, ескертулер және шешімдер",
  ],
  [
    "production",
    Factory,
    "Производство",
    "Точные файлы и подтверждение получения",
    "Өндіріс",
    "Нақты файлдар және алуды растау",
  ],
] as const;
export default function DemoEntry() {
  const [locale, L] = useState<"ru" | "kz">("ru"),
    [busy, B] = useState(""),
    [error, E] = useState("");
  const kz = locale === "kz";
  async function enter(role: DemoRole) {
    B(role);
    E("");
    try {
      const r = await fetch("/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      location.href = j.next;
    } catch (e) {
      E((e as Error).message);
      B("");
    }
  }
  return (
    <main className="demo-entry-page">
      <header>
        <Link href="/login" className="brand">
          <Box size={25} />
          <b>PackApprove</b>
        </Link>
        <button className="btn" onClick={() => L(kz ? "ru" : "kz")}>
          RU / KZ
        </button>
      </header>
      <div className="demo-entry-intro">
        <span className="eyebrow">QAZALPACK / DEMO WORKSPACE</span>
        <h1>{kz ? "Жұмыс кабинетін таңдаңыз" : "Выберите рабочий кабинет"}</h1>
        <p>
          {kz
            ? "Дайын оқу тапсырыстары. Өзгерістер тек демоортада сақталады."
            : "Готовые учебные заказы. Изменения сохраняются только в демосреде."}
        </p>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="demo-entry-layout">
        <section
          className="demo-role-grid"
          aria-label={kz ? "Демо рөлдері" : "Демонстрационные роли"}
        >
          {roles.map(([role, Icon, name, desc, nameKz, descKz], i) => (
            <button
              key={role}
              className="demo-role-card"
              disabled={!!busy}
              onClick={() => void enter(role)}
              aria-label={
                (kz ? "Кабинетті ашу: " : "Открыть кабинет: ") +
                (kz ? nameKz : name)
              }
            >
              <span className="demo-role-icon">
                <Icon size={23} />
              </span>
              <span>
                <small>0{i + 1}</small>
                <h2>{kz ? nameKz : name}</h2>
                <p>{kz ? descKz : desc}</p>
              </span>
              {busy === role ? (
                <Loader2 className="spin" size={20} />
              ) : (
                <ArrowRight size={20} />
              )}
            </button>
          ))}
        </section>
        <aside className="demo-orders">
          <span className="eyebrow">450 / 330 / 250 ML</span>
          <h2>
            {kz ? "Үш формат — толық процесс" : "Три формата — весь процесс"}
          </h2>
          {[
            [
              "standard450",
              "ZHYRA",
              "450 мл",
              kz ? "Клиенттің шешімі күтілуде" : "Ожидает решения клиента",
            ],
            [
              "sleek330",
              "SAIA",
              "330 мл",
              kz ? "Жаңа нұсқаны тексеру" : "Проверка новой версии",
            ],
            [
              "slim250",
              "TUN",
              "250 мл",
              kz ? "Өндіріске берілді" : "Передано в производство",
            ],
          ].map(([image, name, ml, status]) => (
            <div className="demo-order" key={name}>
              <img
                src={"/can-demos/" + image + ".png"}
                alt={name + " / " + ml}
              />
              <div>
                <b>
                  {name} <span>{ml}</span>
                </b>
                <p>{status}</p>
              </div>
            </div>
          ))}
          <p>
            {kz
              ? "Макетті жобадан ашыңыз: нұсқа → 2D/3D → пікірлер → келісу."
              : "Откройте макет из проекта: версия → 2D/3D → комментарии → согласование."}
          </p>
          <Link href="/can-lab" className="text-btn">
            {kz ? "Жеке 3D демонстрациясы" : "Отдельная 3D-демонстрация"}{" "}
            <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
      <Link href="/login" className="text-btn demo-entry-back">
        <ArrowLeft size={15} />
        {kz ? "Өз аккаунтыма кіру" : "Войти в свой аккаунт"}
      </Link>
    </main>
  );
}
export function DemoWorkspaceBar({ locale }: { locale: "ru" | "kz" }) {
  const kz = locale === "kz";
  return (
    <aside
      className="demo-workspace-bar"
      aria-label={kz ? "Демоорта" : "Демонстрационная среда"}
    >
      <span>
        <i />
        {kz ? "Демоорта" : "Демосреда"}
        <small>{kz ? "Оқу тапсырыстары" : "Учебные заказы"}</small>
      </span>
      <Link href="/demo">
        {kz ? "Рөлді ауыстыру" : "Сменить роль"}
        <ArrowRight size={14} />
      </Link>
    </aside>
  );
}
