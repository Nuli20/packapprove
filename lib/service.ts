import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { asUser, type Tx } from "./db";
import { assert, permit, sha256, detectMime } from "./security";
import { canSpecSchema } from "./can-spec";
import { authorizeCommand } from "./commands/permissions";
import { projectCommand } from "./commands/projects";
import { verifiedUpload, validateImageSize } from "./uploads";
import { storageClient } from "./platform";
export type User = { id: string; role: string; full_name?: string };
const uuid = z.string().uuid();
export const commandSchema = z.object({
  action: z.enum([
    "project.create",
    "project.update",
    "artwork.create",
    "brief.save",
    "version.create",
    "version.submit",
    "review.complete",
    "round.open",
    "decision.create",
    "comment.create",
    "comment.reply",
    "comment.resolve",
    "comment.carry",
    "package.issue",
    "package.ack",
    "package.revoke",
    "notification.read",
    "organization.create",
    "company.initialize",
    "invitation.resend",
    "profile.update",
    "invitation.create",
    "template.create",
  ]),
  entityId: uuid.optional(),
  rowVersion: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type Command = z.infer<typeof commandSchema>;
const text = (v: unknown, max = 5000) =>
  z.string().trim().min(1).max(max).parse(v);
async function audit(
  tx: Tx,
  u: User,
  action: string,
  id: string,
  projectId: string | null = null,
  detail: Record<string, any> = {},
) {
  await tx`insert into audit_logs(actor_id,project_id,action,entity_id,detail) values(${u.id},${projectId},${action},${id},${tx.json(detail)})`;
}
async function notify(tx: Tx, projectId: string, kind: string) {
  await tx`select enqueue_event(${projectId},${kind})`;
}
async function artwork(tx: Tx, id: string, rv?: number) {
  const a = (
    await tx`select a.*,p.organization_id from artworks a join projects p on p.id=a.project_id where a.id=${id} for update of a`
  )[0];
  assert(a, "Макет не найден", 404);
  assert(
    rv === undefined || a.row_version === rv,
    "Данные изменились. Обновите страницу.",
  );
  return a;
}
async function version(tx: Tx, id: string) {
  const v = (await tx`select * from artwork_versions where id=${id}`)[0];
  assert(v, "Версия недоступна", 404);
  return v;
}
export async function execute(
  u: User,
  key: string,
  input: Command,
  meta: { ip?: string; ua?: string } = {},
) {
  const c = commandSchema.parse(input);
  authorizeCommand(u, c);
  assert(key && key.length <= 150, "Нужен Idempotency-Key", 400);
  return asUser(u.id, async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${u.id + key},0))`;
    const fingerprint = sha256(JSON.stringify(c));
    const old = (
      await tx`select * from idempotency_keys where user_id=${u.id} and key=${key}`
    )[0];
    if (old) {
      assert(
        old.request_hash === fingerprint && old.operation === c.action,
        "Ключ уже использован для другой операции",
      );
      if (c.action === "invitation.resend" && u.role !== "admin") {
        const [invitation] =
          await tx`select role from invitations where id=${c.entityId!}`;
        assert(
          invitation && ["observer", "approver"].includes(invitation.role),
          "Приглашение недоступно",
          403,
        );
      }
      return old.response;
    }
    const [rate] =
      await tx`insert into rate_limits(user_id,bucket) values(${u.id},date_trunc('minute',now())) on conflict(user_id,bucket) do update set count=rate_limits.count+1 returning count`;
    assert(rate.count <= 90, "Слишком много запросов", 429);
    const p = c.payload;
    let result: Record<string, unknown> = {};
    let projectId: string | null = null;
    let privateEvent = false;
    let auditDetail: Record<string, any> = {};
    let entity = c.entityId || randomUUID();
    if (c.action === "company.initialize") {
      permit(u.role, ["admin"]);
      await tx`select pg_advisory_xact_lock(hashtextextended('packapprove-company-initialize',0))`;
      let [company] =
        await tx`select id from organizations where kind='manufacturer'`;
      if (!company)
        [company] =
          await tx`insert into organizations(name,kind) values('ТОО «QAZALPACK»','manufacturer') returning id`;
      await tx`insert into organization_memberships(organization_id,user_id) values(${company.id},${u.id}) on conflict do nothing`;
      if (!(await tx`select id from checklist_templates limit 1`).length) {
        const [template] =
          await tx`insert into checklist_templates(name) values('Проверка упаковки') returning id`;
        await tx`insert into checklist_template_versions(template_id,number,items) values(${template.id},1,${tx.json(["Формат PDF", "Цветовая модель CMYK", "Вылеты", "Безопасные поля", "Разрешение изображений", "Встроенные шрифты", "Толщина линий", "Overprint", "Штрихкод", "Размеры", "Количество страниц", "Производственный файл"])})`;
      }
      entity = company.id;
      result = { id: company.id };
    } else if (c.action === "invitation.resend") {
      permit(u.role, ["admin", "manager"]);
      const [invitation] =
        await tx`select * from invitations where id=${entity} for update`;
      assert(invitation, "Приглашение не найдено", 404);
      assert(!invitation.accepted_at, "Приглашение уже принято");
      if (!["observer", "approver"].includes(invitation.role))
        permit(u.role, ["admin"]);
      const token = randomBytes(32).toString("hex");
      await tx`update invitations set token_hash=${sha256(token)},expires_at=now()+interval '7 days' where id=${entity}`;
      result = { id: entity, invitationUrl: "/invite#token=" + token };
    } else if (
      ["project.create", "project.update", "artwork.create"].includes(c.action)
    ) {
      const outcome = await projectCommand(tx, u, c, entity);
      entity = outcome.entity;
      projectId = outcome.projectId;
      result = outcome.result;
    } else if (c.action === "organization.create") {
      permit(u.role, ["admin", "manager"]);
      const [r] =
        await tx`insert into organizations(id,name,kind) values(${entity},${text(p.name, 160)},'client') returning id`;
      result = r;
    } else if (c.action === "profile.update") {
      permit(u.role, ["admin"]);
      const role = z
        .enum([
          "admin",
          "manager",
          "designer",
          "prepress",
          "observer",
          "approver",
          "production",
        ])
        .parse(p.role);
      assert(entity !== u.id, "Собственную роль менять нельзя", 400);
      const [before] =
        await tx`select role,active from profiles where id=${uuid.parse(entity)} for update`;
      assert(before, "Профиль не найден", 404);
      auditDetail = { before, after: { role, active: p.active } };
      const [r] =
        await tx`update profiles set role=${role},active=${z.boolean().parse(p.active)} where id=${uuid.parse(entity)} and row_version=${z.number().int().parse(c.rowVersion)} returning id`;
      assert(r, "Профиль изменился");
      result = r;
    } else if (c.action === "invitation.create") {
      permit(u.role, ["admin", "manager"]);
      const token = randomBytes(32).toString("hex");
      const oid = uuid.parse(p.organizationId);
      const role = z
        .enum([
          "admin",
          "manager",
          "designer",
          "prepress",
          "observer",
          "approver",
          "production",
        ])
        .parse(p.role);
      if (!["observer", "approver"].includes(role)) permit(u.role, ["admin"]);
      const kind = ["observer", "approver"].includes(role)
        ? "client"
        : "manufacturer";
      assert(
        (
          await tx`select id from organizations where id=${oid} and kind=${kind}`
        ).length,
        "Проверьте организацию и роль",
        400,
      );
      const [r] =
        await tx`insert into invitations(id,organization_id,email,role,invited_by,token_hash) values(${entity},${oid},${z.email().parse(p.email)},${role},${u.id},${sha256(token)}) returning id`;
      result = { id: r.id, invitationUrl: "/invite#token=" + token };
    } else if (c.action === "template.create") {
      permit(u.role, ["admin"]);
      const items = z
        .array(z.string().min(1).max(120))
        .min(1)
        .max(40)
        .parse(p.items);
      let tid: string;
      if (p.templateId) {
        tid = uuid.parse(p.templateId);
        assert(
          (
            await tx`select id from checklist_templates where id=${tid} for update`
          ).length,
          "Шаблон не найден",
          404,
        );
      } else {
        tid = (
          await tx`insert into checklist_templates(name) values(${text(p.name, 120)}) returning id`
        )[0].id;
      }
      const [{ n }] =
        await tx`select coalesce(max(number),0)+1 as n from checklist_template_versions where template_id=${tid}`;
      await tx`insert into checklist_template_versions(template_id,number,items) values(${tid},${n},${tx.json(items)})`;
      entity = tid;
      result = { id: entity };
    } else if (c.action === "notification.read") {
      await tx`update notifications set read_at=now() where id=${entity} and user_id=${u.id}`;
      result = { id: entity };
    } else if (
      c.action.startsWith("package.") &&
      c.action !== "package.issue"
    ) {
      permit(
        u.role,
        c.action === "package.ack" ? ["production"] : ["admin", "manager"],
      );
      const pkg = (
        await tx`select * from production_packages where id=${entity} for update`
      )[0];
      assert(pkg, "Комплект не найден", 404);
      projectId = pkg.project_id;
      assert(c.rowVersion === pkg.row_version, "Комплект изменился");
      assert(
        ["transferred", "received"].includes(pkg.status),
        "Комплект отозван или заменён",
      );
      if (c.action === "package.ack") {
        assert(pkg.status === "transferred", "Комплект уже получен");
        assert(p.sha256 === pkg.sha256, "Контрольная сумма не совпадает");
        await tx`insert into package_acknowledgements(package_id,user_id,sha256) values(${entity},${u.id},${pkg.sha256})`;
        await tx`update production_packages set status='received' where id=${entity}`;
      } else {
        await tx`insert into package_revocations(package_id,user_id,reason) values(${entity},${u.id},${text(p.reason)})`;
        await tx`update production_packages set status='revoked' where id=${entity}`;
      }
      result = { id: entity };
    } else {
      let v: postgresRow | undefined;
      let aid: string;
      if (["brief.save", "version.create"].includes(c.action))
        aid = uuid.parse(c.entityId);
      else if (
        c.action === "comment.reply" ||
        c.action === "comment.resolve" ||
        c.action === "comment.carry"
      ) {
        const t = (
          await tx`select * from comment_threads where id=${entity}`
        )[0];
        assert(t, "Комментарий недоступен", 404);
        privateEvent = t.visibility === "internal";
        v = await version(tx, t.version_id);
        aid = v.artwork_id;
      } else if (c.action === "decision.create") {
        const r = (
          await tx`select * from approval_rounds where id=${entity}`
        )[0];
        assert(r, "Раунд недоступен", 404);
        v = await version(tx, r.version_id);
        aid = v.artwork_id;
      } else {
        v = await version(tx, uuid.parse(c.entityId));
        aid = v.artwork_id;
      }
      const a = await artwork(
        tx,
        aid,
        ["brief.save", "version.create"].includes(c.action)
          ? c.rowVersion
          : undefined,
      );
      projectId = a.project_id;
      if (c.action === "brief.save") {
        permit(u.role, ["admin", "manager"]);
        const content = z
          .record(
            z.string(),
            z.union([z.string().max(5000), z.number(), z.array(z.string())]),
          )
          .parse(p.content);
        const [{ n }] =
          await tx`select coalesce(max(number),0)+1 as n from brief_versions where artwork_id=${aid}`;
        const [r] =
          await tx`insert into brief_versions(artwork_id,number,content,author_id) values(${aid},${n},${tx.json(content)},${u.id}) returning id`;
        result = r;
      } else if (c.action === "version.create") {
        permit(u.role, ["designer"]);
        assert(c.rowVersion === a.row_version, "Макет изменился");
        const files = z
          .array(
            z.object({
              kind: z.enum(["source", "preview", "production"]),
              filename: z.string().min(1).max(180),
              base64: z.string().min(1).max(3000000).optional(),
              uploadId: z.string().uuid().optional(),
            }),
          )
          .min(1)
          .max(3)
          .parse(p.files);
        assert(
          new Set(files.map((f) => f.kind)).size === files.length,
          "Повтор типа файла",
          400,
        );
        assert(
          files.some((f) => f.kind === "preview") &&
            files.some((f) => f.kind === "production"),
          "Нужны предпросмотр и производственный файл",
          400,
        );
        const [{ n }] =
          await tx`select coalesce(max(number),0)+1 as n from artwork_versions where artwork_id=${aid}`;
        const vid = randomUUID();
        await tx`insert into artwork_versions(id,artwork_id,number,previous_version_id,author_id,changes) values(${vid},${aid},${n},${a.active_version_id},${u.id},${text(p.changes)})`;
        for (const f of files) {
          assert(
            !!f.base64 !== !!f.uploadId,
            "Укажите только uploadId или Base64",
            400,
          );
          const uploaded = f.uploadId
            ? await verifiedUpload(tx, u, f.uploadId, aid, f.kind)
            : null;
          const bytes = uploaded?.bytes || Buffer.from(f.base64!, "base64");
          const mime = uploaded?.mime || detectMime(bytes);
          validateImageSize(bytes, mime);
          const fid = randomUUID();
          const path = `${a.organization_id}/${aid}/${vid}/${fid}`;
          const { error } = await storageClient().upload(path, bytes, {
            contentType: mime,
            upsert: false,
          });
          assert(!error, "Не удалось сохранить файл", 502);
          await tx`insert into version_files(id,version_id,kind,storage_path,filename,mime_type,size,sha256) values(${fid},${vid},${f.kind},${path},${f.filename},${mime},${bytes.length},${sha256(bytes)})`;
        }
        if (p.canSpec) {
          const canSpec = canSpecSchema.parse(p.canSpec);
          await tx`insert into version_visualizations(version_id,author_id,spec) values(${vid},${u.id},${tx.json(canSpec)})`;
        }
        await tx`update approval_rounds set status='superseded',closed_at=now() where artwork_id=${aid} and status='open'`;
        await tx`update artworks set active_version_id=${vid},status='in_progress' where id=${aid}`;
        entity = vid;
        result = { id: vid };
      } else if (c.action === "version.submit") {
        permit(u.role, ["designer"]);
        assert(
          a.active_version_id === v!.id && v!.status === "fixed",
          "Версия уже отправлена или устарела",
        );
        await tx`update artwork_versions set status='internal_review' where id=${v!.id}`;
        await tx`update artworks set status='review' where id=${aid}`;
        result = { id: v!.id };
      } else if (c.action === "review.complete") {
        permit(u.role, ["prepress"]);
        assert(
          a.active_version_id === v!.id &&
            ["internal_review", "published", "approved"].includes(v!.status),
          "Версия не на внутренней проверке",
        );
        const template = uuid.parse(p.templateId);
        const [t] =
          await tx`select * from checklist_template_versions where id=${template}`;
        assert(t, "Шаблон не найден", 404);
        const items = z
          .array(z.object({ label: z.string(), passed: z.boolean() }))
          .parse(p.items);
        const labels = t.items as string[];
        assert(
          items.length === labels.length &&
            labels.every(
              (l) => items.filter((i) => i.label === l).length === 1,
            ),
          "Заполните весь чек-лист",
          400,
        );
        const status = z
          .enum(["ready", "limited", "correction"])
          .parse(p.status);
        assert(
          status !== "ready" || items.every((i) => i.passed),
          "Не все проверки пройдены",
        );
        const [r] =
          await tx`insert into technical_reviews(version_id,template_version_id,reviewer_id,status,notes) values(${v!.id},${template},${u.id},${status},${z
            .string()
            .max(5000)
            .parse(p.notes || "")}) returning id`;
        for (const i of items)
          await tx`insert into technical_review_items(review_id,label,passed) values(${r.id},${i.label},${i.passed})`;
        result = { id: r.id };
      } else if (c.action === "round.open") {
        permit(u.role, ["admin", "manager"]);
        assert(a.active_version_id === v!.id, "Версия устарела");
        assert(
          ["internal_review", "published"].includes(v!.status),
          "Версия не готова к отправке",
        );
        const users = z.array(uuid).min(1).max(20).parse(p.approvers);
        assert(
          new Set(users).size === users.length,
          "Повтор согласующего",
          400,
        );
        for (const id of users)
          assert(
            (
              await tx`select p.id from profiles p join organization_memberships m on m.user_id=p.id where p.id=${id} and m.organization_id=${a.organization_id} and p.role='approver' and p.active`
            ).length,
            "Согласующий не принадлежит клиенту",
            403,
          );
        const observers = z
          .array(uuid)
          .max(20)
          .parse(p.observers || []);
        for (const id of observers)
          assert(
            (
              await tx`select p.id from profiles p join organization_memberships m on m.user_id=p.id where p.id=${id} and m.organization_id=${a.organization_id} and p.role in ('observer','approver') and p.active`
            ).length,
            "Наблюдатель не принадлежит клиенту",
            403,
          );
        assert(
          (
            await tx`select id from version_files where version_id=${v!.id} and kind='preview'`
          ).length,
          "Нет предпросмотра",
        );
        await tx`update approval_rounds set status='superseded',closed_at=now() where artwork_id=${aid} and status='open'`;
        const [r] =
          await tx`insert into approval_rounds(artwork_id,version_id,opened_by,deadline) values(${aid},${v!.id},${u.id},${z.iso.datetime({ offset: true }).parse(p.deadline)}) returning id`;
        for (const id of users)
          await tx`insert into approval_participants(round_id,user_id,kind) values(${r.id},${id},'approver')`;
        for (const id of observers.filter((id) => !users.includes(id)))
          await tx`insert into approval_participants(round_id,user_id,kind) values(${r.id},${id},'observer')`;
        await tx`update artwork_versions set status='published' where id=${v!.id}`;
        await tx`update artworks set status='review' where id=${aid}`;
        result = { id: r.id };
      } else if (c.action === "decision.create") {
        permit(u.role, ["approver"]);
        const r = (
          await tx`select * from approval_rounds where id=${entity} for update`
        )[0];
        assert(
          r.status === "open" && a.active_version_id === r.version_id,
          "Раунд устарел. Откройте актуальную версию.",
        );
        assert(
          (
            await tx`select id from approval_participants where round_id=${entity} and user_id=${u.id} and kind='approver'`
          ).length,
          "Вы не назначены согласующим",
          403,
        );
        assert(
          !(
            await tx`select id from approval_decisions where round_id=${entity} and user_id=${u.id}`
          ).length,
          "Решение уже зафиксировано",
        );
        const f = (
          await tx`select sha256 from version_files where version_id=${r.version_id} and kind='preview'`
        )[0];
        const decision = z
          .enum(["approved", "changes_requested"])
          .parse(p.result);
        const comment = z
          .string()
          .max(5000)
          .parse(p.comment || "");
        assert(
          decision !== "changes_requested" || comment.trim().length > 0,
          "Укажите необходимые изменения",
          400,
        );
        await tx`insert into approval_decisions(round_id,version_id,user_id,result,comment,ip,user_agent,sha256) values(${entity},${r.version_id},${u.id},${decision},${comment.slice(0, 5000)},${meta.ip || null},${meta.ua?.slice(0, 500) || null},${f.sha256})`;
        const [{ remaining }] =
          await tx`select count(*)::int as remaining from approval_participants p where p.round_id=${entity} and p.kind='approver' and not exists(select 1 from approval_decisions d where d.round_id=p.round_id and d.user_id=p.user_id and d.result='approved')`;
        if (decision === "changes_requested" || remaining === 0) {
          const state =
            decision === "changes_requested" ? "changes_requested" : "approved";
          await tx`update approval_rounds set status=${state},closed_at=now() where id=${entity}`;
          await tx`update artwork_versions set status=${state} where id=${r.version_id}`;
          await tx`update artworks set status=${state === "approved" ? "approved" : "in_progress"} where id=${aid}`;
        }
        result = { id: entity, remaining };
      } else if (c.action === "comment.create") {
        permit(u.role, [
          "admin",
          "manager",
          "designer",
          "prepress",
          "observer",
          "approver",
        ]);
        const visibility = z.enum(["client", "internal"]).parse(p.visibility);
        assert(
          !["observer", "approver"].includes(u.role) || visibility === "client",
          "Внутренняя переписка недоступна",
          403,
        );
        const [t] =
          await tx`insert into comment_threads(version_id,author_id,page,x,y,type,visibility) values(${v!.id},${u.id},${z.number().int().min(1).max(10000).parse(p.page)},${z.number().min(0).max(1).parse(p.x)},${z.number().min(0).max(1).parse(p.y)},${z.enum(["design", "technical", "question"]).parse(p.type || "design")},${visibility}) returning id`;
        await tx`insert into comments(thread_id,author_id,body) values(${t.id},${u.id},${text(p.body)})`;
        result = { id: t.id };
      } else if (c.action === "comment.reply") {
        permit(u.role, [
          "admin",
          "manager",
          "designer",
          "prepress",
          "observer",
          "approver",
        ]);
        await tx`insert into comments(thread_id,author_id,body) values(${entity},${u.id},${text(p.body)})`;
        result = { id: entity };
      } else if (c.action === "comment.carry") {
        permit(u.role, ["designer", "manager", "admin"]);
        const [source] =
          await tx`select * from comment_threads where id=${entity}`;
        assert(source?.status === "open", "Замечание уже закрыто");
        const target = await version(tx, uuid.parse(p.targetVersionId));
        assert(
          target.artwork_id === aid && target.number > v!.number,
          "Выберите следующую версию",
        );
        const [thread] =
          await tx`insert into comment_threads(version_id,author_id,page,x,y,type,visibility,carried_from_id) values(${target.id},${source.author_id},${source.page},${source.x},${source.y},${source.type},${source.visibility},${source.id}) returning id`;
        await tx`insert into comments(thread_id,author_id,body,created_at) select ${thread.id},author_id,body,created_at from comments where thread_id=${source.id}`;
        result = { id: thread.id };
      } else if (c.action === "comment.resolve") {
        permit(u.role, ["designer", "manager", "admin"]);
        const fixed = await version(tx, uuid.parse(p.fixedInVersionId));
        assert(
          fixed.artwork_id === aid && fixed.number > v!.number,
          "Исправление должно быть в следующей версии",
        );
        await tx`insert into comment_resolution_links(thread_id,fixed_in_version_id) values(${entity},${fixed.id})`;
        await tx`update comment_threads set status='resolved' where id=${entity}`;
        result = { id: entity };
      } else if (c.action === "package.issue") {
        permit(u.role, ["admin", "manager"]);
        assert(
          a.active_version_id === v!.id && v!.status === "approved",
          "Нужна активная утверждённая версия",
        );
        const r = (
          await tx`select * from approval_rounds where version_id=${v!.id} order by created_at desc limit 1`
        )[0];
        assert(r?.status === "approved", "Нет действующего утверждения");
        const review = (
          await tx`select * from technical_reviews where version_id=${v!.id}`
        )[0];
        assert(review?.status === "ready", "Нет успешной технической проверки");
        const f = (
          await tx`select * from version_files where version_id=${v!.id} and kind='production'`
        )[0];
        assert(f, "Производственный файл отсутствует");
        assert(
          !(
            await tx`select id from production_packages where version_id=${v!.id}`
          ).length,
          "Комплект для версии уже создан",
        );
        const id = randomUUID();
        const number = `QP-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
        await tx`insert into production_packages(id,number,project_id,artwork_id,version_id,approval_round_id,technical_review_id,file_id,sha256,issued_by) values(${id},${number},${projectId},${aid},${v!.id},${r.id},${review.id},${f.id},${f.sha256},${u.id})`;
        await tx`insert into production_package_files(package_id,file_id) values(${id},${f.id})`;
        await tx`update artworks set status='production' where id=${aid}`;
        entity = id;
        result = { id, number };
      }
    }
    await audit(tx, u, c.action, entity, projectId, auditDetail);
    if (projectId)
      await notify(
        tx,
        projectId,
        privateEvent ||
          (c.action === "comment.create" && p.visibility === "internal")
          ? "comment.internal"
          : c.action,
      );
    await tx`insert into idempotency_keys(user_id,key,operation,request_hash,response) values(${u.id},${key},${c.action},${fingerprint},${tx.json(result as any)})`;
    return result;
  });
}
type postgresRow = Record<string, any>;
