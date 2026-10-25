import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { readFile } from "node:fs/promises";
import { db } from "../lib/db";
import { execute, type User } from "../lib/service";
import { adminClient } from "../lib/platform";
import { randomUUID } from "node:crypto";
import { DEFAULT_CAN_SPEC } from "../lib/can-spec";
if (
  new URL(process.env.DATABASE_URL!).port !== "54322" ||
  new URL(process.env.SUPABASE_URL!).port !== "54321" ||
  process.env.NEXT_PUBLIC_DEMO_MODE !== "true" ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  ) ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.SUPABASE_URL!).hostname,
  )
)
  throw Error(
    "Can samples require an isolated local demo environment. Production seed is forbidden.",
  );
try {
  const existing =
    await db`select id from projects where name='DEMO / Aluminium Can Collection'`;
  if (existing.length) {
    console.log("Can demo project already exists; preserved.");
    process.exitCode = 0;
  } else {
    const profiles = await db`select * from profiles`;
    const user = (role: string) =>
      profiles.find((p) => p.role === role && p.active) as User;
    const manager = user("manager"),
      designer = user("designer"),
      prepress = user("prepress"),
      admin = user("admin");
    if (!manager || !designer || !prepress || !admin)
      throw Error("Run the local base demo seed first.");
    const act = (
      u: User,
      action: any,
      id?: string,
      payload: any = {},
      rowVersion?: number,
    ) =>
      execute(u, randomUUID(), { action, entityId: id, payload, rowVersion });
    let [org] =
      await db`select id from organizations where name='DEMO / Beverage Design Lab'`;
    if (!org)
      org = await act(admin, "organization.create", undefined, {
        name: "DEMO / Beverage Design Lab",
      });
    const email = "can-approver@packapprove.local";
    let auth = (
      await adminClient().auth.admin.listUsers({ perPage: 1000 })
    ).data.users.find((u) => u.email === email);
    if (!auth) {
      const { data, error } = await adminClient().auth.admin.createUser({
        email,
        password: "PackApprove2026!",
        email_confirm: true,
      });
      if (error) throw error;
      auth = data.user!;
    }
    await db`insert into profiles(id,full_name,role) values(${auth.id},'DEMO / Алюминиевая тара','approver') on conflict do nothing`;
    await db`insert into organization_memberships(organization_id,user_id) values(${org.id},${auth.id}) on conflict do nothing`;
    const manifest = JSON.parse(
      await readFile("public/can-demos/manifest.json", "utf8"),
    );
    const project = await act(manager, "project.create", undefined, {
      name: "DEMO / Aluminium Can Collection",
      organizationId: org.id,
      description:
        "Отдельные вымышленные бренды и приблизительные модели алюминиевых банок. Не производственный шаблон.",
      designerId: designer.id,
      prepressId: prepress.id,
      deadline: "2026-12-20",
      priority: "normal",
      artworks: manifest.map(
        (d: any) => `${d.brand} / ${d.name} / ${d.volumeMl} мл`,
      ),
    });
    const artworks =
      await db`select * from artworks where project_id=${project.id} order by created_at,id`;
    const template = (
      await db`select * from checklist_template_versions limit 1`
    )[0];
    for (const demo of manifest) {
      const a = artworks.find((a) => a.name.startsWith(demo.brand + " /"))!;
      await db`update artworks set packaging_type='Алюминиевая банка' where id=${a.id}`;
      const [current] =
        await db`select row_version from artworks where id=${a.id}`;
      const base64 = (
        await readFile(`public/can-demos/${demo.filename}`)
      ).toString("base64");
      const v = await act(
        designer,
        "version.create",
        a.id,
        {
          changes:
            "Оригинальный демонстрационный дизайн алюминиевой банки. Геометрия приблизительная.",
          canSpec: { ...DEFAULT_CAN_SPEC, preset: demo.preset },
          files: ["preview", "production"].map((kind) => ({
            kind,
            filename: demo.filename,
            base64,
          })),
        },
        current.row_version,
      );
      await act(designer, "version.submit", v.id);
      await act(prepress, "review.complete", v.id, {
        templateId: template.id,
        status: "ready",
        items: template.items.map((label: string) => ({ label, passed: true })),
        notes: "Только локальная демонстрация процесса. Не печатать.",
      });
      await act(manager, "round.open", v.id, {
        approvers: [auth.id],
        deadline: "2026-12-20T12:00:00Z",
      });
      await act(designer, "comment.create", v.id, {
        page: 1,
        x: 0.5,
        y: 0.4,
        type: "design",
        visibility: "client",
        body: "Рассмотрите рисунок на 3D-банке. Геометрия визуальная; согласуется сохранённый файл этой версии.",
      });
    }
    console.log(
      "Created isolated can demo project: 3 formats, PNG/PDF/JPG, private version files, real client approval rounds.",
    );
  }
} finally {
  await db.end();
}
