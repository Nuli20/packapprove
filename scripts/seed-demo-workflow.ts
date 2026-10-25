import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isolatedDemoEnabled } from "../lib/demo-environment";
import { db } from "../lib/db";
import { execute, type User } from "../lib/service";
import { DEFAULT_CAN_SPEC } from "../lib/can-spec";
if (!isolatedDemoEnabled())
  throw Error(
    "Workflow seed is permitted only in the separate local demo Supabase.",
  );
const day = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
try {
  const profiles =
    await db`select p.*,u.email from profiles p join auth.users u on u.id=p.id where p.active`;
  const byEmail = (email: string) => {
    const p = profiles.find((p) => p.email === email);
    if (!p) throw Error("Run the base and can seeds first.");
    return p as User;
  };
  const admin = byEmail("admin@packapprove.local"),
    manager = byEmail("manager@packapprove.local"),
    designer = byEmail("designer@packapprove.local"),
    prepress = byEmail("prepress@packapprove.local"),
    client = byEmail("can-approver@packapprove.local");
  const org = (
    await db`select organization_id from organization_memberships where user_id=${client.id} limit 1`
  )[0];
  if (!org) throw Error("Can demo client organization is missing");
  const template = (
    await db`select * from checklist_template_versions order by created_at limit 1`
  )[0];
  const act = (
    u: User,
    action: any,
    entityId?: string,
    payload: Record<string, any> = {},
    rowVersion?: number,
  ) => execute(u, randomUUID(), { action, entityId, payload, rowVersion });
  let created = 0;
  for (const scenario of [
    {
      name: "DEMO / ZHYRA — подготовка дизайна, 450 мл",
      artwork: "ZHYRA / подготовка дизайна / 450 мл",
      preset: "standard450",
      file: "zhyra-450.png",
      stage: "draft",
    },
    {
      name: "DEMO / ZHYRA — серия «Цитрус», 450 мл",
      artwork: "ZHYRA / цитрусовый напиток / 450 мл",
      preset: "standard450",
      file: "zhyra-450.png",
      stage: "approval",
    },
    {
      name: "DEMO / SAIA — редизайн холодного чая, 330 мл",
      artwork: "SAIA / холодный чай / 330 мл",
      preset: "sleek330",
      file: "sleek330.png",
      stage: "review",
    },
    {
      name: "DEMO / TUN — энергетический напиток, 250 мл",
      artwork: "TUN / энергетический напиток / 250 мл",
      preset: "slim250",
      file: "tun-250.jpg",
      stage: "production",
    },
  ]) {
    if ((await db`select id from projects where name=${scenario.name}`).length)
      continue;
    const project = await act(manager, "project.create", undefined, {
      name: scenario.name,
      organizationId: org.organization_id,
      designerId: designer.id,
      prepressId: prepress.id,
      deadline: day(scenario.stage === "review" ? 4 : 9),
      customerOrder: "DEMO-" + scenario.preset.toUpperCase(),
      contacts: "Команда Beverage Design Lab",
      description:
        "Изолированный учебный заказ. Вымышленный бренд. Не для печати.",
      priority: scenario.stage === "review" ? "high" : "normal",
      artworks: [scenario.artwork],
    });
    const a = (
      await db`select * from artworks where project_id=${project.id}`
    )[0];
    const upload = async (file: string, changes: string) => {
      const base64 = (await readFile("public/can-demos/" + file)).toString(
        "base64",
      );
      const current = (
        await db`select row_version from artworks where id=${a.id}`
      )[0];
      return act(
        designer,
        "version.create",
        a.id,
        {
          changes,
          canSpec: { ...DEFAULT_CAN_SPEC, preset: scenario.preset },
          files: ["preview", "production"].map((kind) => ({
            kind,
            filename: file,
            base64,
          })),
        },
        current.row_version,
      );
    };
    const v = await upload(
      scenario.file,
      "Первая версия дизайна: проверка композиции и текста.",
    );
    if (scenario.stage === "draft") {
      created++;
      continue;
    }
    await act(designer, "version.submit", v.id);
    await act(prepress, "review.complete", v.id, {
      templateId: template.id,
      status: "ready",
      items: template.items.map((label: string) => ({ label, passed: true })),
      notes:
        "Учебная техническая проверка. Макет не предназначен для выпуска тиража.",
    });
    const round = await act(manager, "round.open", v.id, {
      approvers: [client.id],
      deadline: day(5) + "T12:00:00Z",
    });
    const comment = await act(client, "comment.create", v.id, {
      page: 1,
      x: 0.5,
      y: 0.45,
      type: "design",
      visibility: "client",
      body:
        scenario.stage === "review"
          ? "Сделайте фон светлее и уточните вкус напитка."
          : "Проверяем название, читаемость текста и расположение рисунка на банке.",
    });
    await act(prepress, "comment.create", v.id, {
      page: 1,
      x: 0.2,
      y: 0.7,
      type: "technical",
      visibility: "internal",
      body: "Внутренняя заметка: подтвердить параметры по точному заводскому шаблону до реального тиража.",
    });
    if (scenario.stage === "review") {
      await act(client, "decision.create", round.id, {
        result: "changes_requested",
        comment: "Светлый фон, вкус «Лимон». Нужна новая версия.",
      });
      const next = await upload(
        "sleek330-page2.png",
        "V2: светлый фон и вкус «Лимон» по замечанию клиента.",
      );
      await act(designer, "comment.carry", comment.id, {
        targetVersionId: next.id,
      });
      await act(designer, "version.submit", next.id);
    } else if (scenario.stage === "production") {
      await act(client, "decision.create", round.id, {
        result: "approved",
        comment:
          "Утверждено для демонстрации процесса. Не использовать как производственный допуск.",
      });
      await act(manager, "package.issue", v.id);
    }
    created++;
  }
  console.log(
    `Demo workflow ready: ${created} new aluminium orders; existing projects preserved.`,
  );
} finally {
  await db.end();
}
