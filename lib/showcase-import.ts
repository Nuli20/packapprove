import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tx } from "./db";
import type { User } from "./service";
import { projectCommand } from "./commands/projects";
import { permit, assert, sha256, detectMime } from "./security";
import { storageClient } from "./platform";
import { DEFAULT_CAN_SPEC } from "./can-spec";
import designs from "../public/showcase/manifest.json";

/** Explicit admin bootstrap of fixed public concepts; never creates accounts or client decisions. */
export async function importShowcase(
  tx: Tx,
  u: User,
  p: Record<string, unknown>,
) {
  permit(u.role, ["admin"]);
  const input = z
    .object({
      confirmed: z.literal(true),
      designerId: z.uuid(),
      prepressId: z.uuid(),
    })
    .parse(p);
  await tx`select pg_advisory_xact_lock(hashtextextended('packapprove-showcase-v1',0))`;
  const members =
    await tx`select distinct p.id,p.role from profiles p join organization_memberships m on m.user_id=p.id join organizations o on o.id=m.organization_id where p.active and o.kind='manufacturer' and ((p.id=${input.designerId} and p.role='designer') or (p.id=${input.prepressId} and p.role='prepress'))`;
  assert(
    members.length === 2,
    "Назначьте активных дизайнера и специалиста допечатной подготовки из команды производителя.",
    400,
  );
  const paths: string[] = [];
  const projects: string[] = [];
  try {
    for (const d of designs) {
      const [existing] =
        await tx`select p.id from audit_logs a join projects p on p.id=a.project_id where a.action='showcase.project.created' and a.detail->>'slug'=${d.slug} limit 1`;
      if (existing) {
        projects.push(existing.id);
        continue;
      }
      const [org] =
        await tx`insert into organizations(name,kind) values(${`DEMO / ${d.brand} Studio`},'client') returning id`;
      const id = randomUUID();
      const deadline = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 10);
      await projectCommand(
        tx,
        u,
        {
          action: "project.create",
          payload: {
            name: `DEMO / ${d.brand}`,
            organizationId: org.id,
            ...input,
            deadline,
            priority: d.slug === "volt-x" ? "high" : "normal",
            description: `DEMO — NOT FOR PRODUCTION. ${d.name}. Приблизительная геометрия, RGB-визуализация. Без клиентских решений и технической готовности.`,
            artworks: [`${d.brand} / ${d.volumeMl} мл`],
          },
        },
        id,
      );
      const [a] = await tx`select id from artworks where project_id=${id}`;
      await tx`update artworks set packaging_type=${`Алюминиевая банка / ${d.preset}`} where id=${a.id}`;
      let previous: string | null = null;
      for (let n = 1; n <= d.versions; n++) {
        const vid = randomUUID();
        await tx`insert into artwork_versions(id,artwork_id,number,previous_version_id,author_id,changes) values(${vid},${a.id},${n},${previous},${u.id},${n === 1 ? "DEMO: оригинальная концепция" : "DEMO: обновлена типографика и служебные детали"})`;
        for (const kind of ["preview", "production"] as const) {
          const filename = `${d.slug}-v${n}.${kind === "preview" ? "png" : "pdf"}`;
          const bytes = await readFile(
            process.cwd() + "/public/showcase/" + filename,
          );
          const mime = detectMime(bytes);
          const fid = randomUUID(),
            path = `${org.id}/${a.id}/${vid}/${fid}`;
          const { error } = await storageClient().upload(path, bytes, {
            contentType: mime,
            upsert: false,
          });
          assert(
            !error,
            "Не удалось сохранить DEMO-файлы. Повторите импорт.",
            502,
          );
          paths.push(path);
          await tx`insert into version_files(id,version_id,kind,storage_path,filename,mime_type,size,sha256) values(${fid},${vid},${kind},${path},${filename},${mime},${bytes.length},${sha256(bytes)})`;
        }
        previous = vid;
      }
      await tx`update artworks set active_version_id=${previous},status='in_progress' where id=${a.id}`;
      await tx`insert into audit_logs(actor_id,project_id,action,entity_id,detail) values(${u.id},${id},'showcase.project.created',${id},${tx.json({ slug: d.slug, collection: 1, demo: true })})`;
      projects.push(id);
    }
    return { projects };
  } catch (e) {
    if (paths.length) await storageClient().remove(paths);
    throw e;
  }
}
