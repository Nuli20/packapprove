import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tx } from "../db";
import type { Command, User } from "../service";
import { assert, permit } from "../security";
const uuid = z.uuid(),
  text = (v: unknown, max = 5000) => z.string().trim().min(1).max(max).parse(v);
export async function projectCommand(
  tx: Tx,
  u: User,
  c: Command,
  initialEntity: string,
) {
  let entity = initialEntity,
    projectId: string | null = null,
    result: Record<string, unknown> = {};
  const p = c.payload;
  if (c.action === "project.create") {
    permit(u.role, ["admin", "manager"]);
    const org = uuid.parse(p.organizationId);
    assert(
      (await tx`select id from organizations where id=${org} and kind='client'`)
        .length,
      "Выберите клиента",
      400,
    );
    const assignees = z.object({ designerId: uuid, prepressId: uuid }).parse(p);
    assert(
      (
        await tx`select id from profiles where active and ((id=${assignees.designerId} and role='designer') or (id=${assignees.prepressId} and role='prepress'))`
      ).length === 2,
      "Проверьте исполнителей",
      400,
    );
    const names = z
      .array(z.string().trim().min(1).max(160))
      .min(1)
      .max(20)
      .parse(p.artworks);
    const deadline = z.iso.date().parse(p.deadline);
    const [pr] =
      await tx`insert into projects(id,organization_id,name,description,customer_order,contacts,manager_id,designer_id,prepress_id,deadline,priority) values(${entity},${org},${text(p.name, 160)},${z
        .string()
        .max(5000)
        .parse(p.description || "")},${z
        .string()
        .max(120)
        .parse(p.customerOrder || "")},${z
        .string()
        .max(2000)
        .parse(
          p.contacts || "",
        )},${u.id},${assignees.designerId},${assignees.prepressId},${deadline},${z.enum(["low", "normal", "high"]).parse(p.priority || "normal")}) returning *`;
    projectId = entity;
    for (const id of [u.id, assignees.designerId, assignees.prepressId])
      await tx`insert into project_members(project_id,user_id) values(${entity},${id}) on conflict do nothing`;
    for (const name of names) {
      const [a] =
        await tx`insert into artworks(project_id,name,deadline) values(${entity},${name},${deadline}) returning id`;
      await tx`insert into brief_versions(artwork_id,number,content,author_id) values(${a.id},1,${tx.json({ dimensions: "", material: "", printing: "", units: "мм", pages: 1, languages: ["RU", "KZ"], mandatoryText: "", brandColors: "", barcode: "", logos: "", finishing: "", references: "", comments: "" })},${u.id})`;
    }
    result = { id: pr.id };
  } else if (c.action === "project.update") {
    permit(u.role, ["admin", "manager"]);
    const [pr] = await tx`select * from projects where id=${entity} for update`;
    assert(pr, "Проект недоступен", 404);
    assert(pr.row_version === c.rowVersion, "Проект изменился");
    projectId = pr.id;
    const pp = z
      .object({
        name: z.string().trim().min(2).max(160),
        deadline: z.iso.date(),
        priority: z.enum(["low", "normal", "high"]),
        status: z.enum(["active", "paused", "completed", "archived"]),
        designerId: uuid,
        prepressId: uuid,
      })
      .parse(p);
    assert(
      (
        await tx`select id from profiles where active and ((id=${pp.designerId} and role='designer') or (id=${pp.prepressId} and role='prepress'))`
      ).length === 2,
      "Проверьте исполнителей",
      400,
    );
    await tx`update projects set name=${pp.name},deadline=${pp.deadline},priority=${pp.priority},status=${pp.status},designer_id=${pp.designerId},prepress_id=${pp.prepressId},description=${z
      .string()
      .max(5000)
      .parse(p.description || "")},contacts=${z
      .string()
      .max(2000)
      .parse(p.contacts || "")},customer_order=${z
      .string()
      .max(120)
      .parse(p.customerOrder || "")} where id=${entity}`;
    await tx`delete from project_members where project_id=${entity}`;
    for (const id of [pr.manager_id, pp.designerId, pp.prepressId].filter(
      Boolean,
    ))
      await tx`insert into project_members(project_id,user_id) values(${entity},${id}) on conflict do nothing`;
    result = { id: entity };
  } else if (c.action === "artwork.create") {
    permit(u.role, ["admin", "manager"]);
    const [project] =
      await tx`select * from projects where id=${entity} for update`;
    assert(project, "Проект недоступен", 404);
    assert(
      project.status === "active",
      "Добавлять макеты можно в активный проект. Сначала верните проект в работу.",
      409,
    );
    assert(
      (
        await tx`select id from profiles where active and ((id=${project.designer_id} and role='designer') or (id=${project.prepress_id} and role='prepress'))`
      ).length === 2,
      "Назначьте активных дизайнера и специалиста допечатной подготовки.",
      409,
    );
    projectId = project.id;
    entity = randomUUID();
    const deadline = z.iso.date().parse(p.deadline),
      name = text(p.name, 160);
    await tx`insert into artworks(id,project_id,name,deadline,packaging_type) values(${entity},${project.id},${name},${deadline},${text(p.packagingType || "Алюминиевая банка", 160)})`;
    await tx`insert into brief_versions(artwork_id,number,content,author_id) values(${entity},1,${tx.json({ units: "мм", material: "Алюминий", languages: ["RU", "KZ"] })},${u.id})`;
    result = { id: entity, projectId };
  }
  return { entity, projectId, result };
}
