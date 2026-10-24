import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { demoPdf } from "./demo-pdf";
import { sha256 } from "../lib/security";
import { mkdir, writeFile } from "node:fs/promises";
export const checklist = [
  "Формат PDF",
  "Цветовая модель CMYK",
  "Вылеты",
  "Безопасные поля",
  "Разрешение изображений",
  "Встроенные шрифты",
  "Толщина линий",
  "Overprint",
  "Штрихкод",
  "Размеры",
  "Количество страниц",
  "Производственный файл",
];
export async function seed() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true")
    throw Error(
      "Demo seed requires NEXT_PUBLIC_DEMO_MODE=true; never seed production",
    );
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  if (
    (await sql`select id from organizations where name='ТОО «QAZALPACK»'`)
      .length
  ) {
    await sql.end();
    console.log("Demo data already exists; preserved.");
    return;
  }
  const people = [
    ["admin", "Алия Сарсенова", "admin"],
    ["manager", "Дана Ибраева", "manager"],
    ["designer", "Арман Касымов", "designer"],
    ["prepress", "Тимур Ахметов", "prepress"],
    ["approver", "Айгерим Нурлан", "approver"],
    ["approver2", "Марат Оспанов", "approver"],
    ["observer", "Алина Серик", "observer"],
    ["production", "Ерлан Байжанов", "production"],
    ["clientb", "Анна Ким", "approver"],
    ["clientc", "Сауле Асанова", "approver"],
  ];
  const ids: Record<string, string> = {};
  const existing = (await supa.auth.admin.listUsers({ perPage: 100 })).data
    .users;
  for (const [slug, full_name, role] of people) {
    const email = `${slug}@packapprove.local`;
    let user = existing.find((u) => u.email === email);
    if (!user) {
      const { data, error } = await supa.auth.admin.createUser({
        email,
        password: "PackApprove2026!",
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user!;
    }
    ids[slug] = user.id;
    await sql`insert into profiles(id,full_name,role) values(${user.id},${full_name},${role}) on conflict do nothing`;
  }
  await mkdir("demo-files", { recursive: true });
  await sql.begin(async (tx) => {
    const orgs = [];
    for (const [name, kind] of [
      ["ТОО «QAZALPACK»", "manufacturer"],
      ["ТОО «Tea House Kazakhstan»", "client"],
      ["ТОО «Almaty Foods»", "client"],
      ["ТОО «Eco Product»", "client"],
    ]) {
      const [o] =
        await tx`insert into organizations(name,kind) values(${name},${kind}) returning id`;
      orgs.push(o.id);
    }
    for (const [slug, , role] of people) {
      const org = ["approver", "approver2", "observer"].includes(slug)
        ? orgs[1]
        : slug === "clientb"
          ? orgs[2]
          : slug === "clientc"
            ? orgs[3]
            : orgs[0];
      await tx`insert into organization_memberships(organization_id,user_id) values(${org},${ids[slug]})`;
    }
    const projects = [];
    for (const [i, name] of [
      "Линейка чая Botanica",
      "Коллекция подарков",
      "Кофе Morning Ritual",
      "Натуральные снеки",
      "Эко-упаковка 2026",
    ].entries()) {
      const [p] =
        await tx`insert into projects(name,organization_id,description,customer_order,contacts,manager_id,designer_id,prepress_id,deadline,priority) values(${name},${orgs[i < 2 ? 1 : i < 4 ? 2 : 3]},'Разработка и согласование упаковки. Русский и казахский языки.',${"QZ-2026-" + (140 + i)},'Контактное лицо клиента · +7 727 000 00 00',${ids.manager},${ids.designer},${ids.prepress},${i === 3 ? "2026-10-20" : "2026-11-" + (10 + i)},${i === 0 ? "high" : "normal"}) returning id`;
      projects.push(p.id);
      for (const slug of ["manager", "designer", "prepress"])
        await tx`insert into project_members(project_id,user_id) values(${p.id},${ids[slug]})`;
    }
    const [template] =
      await tx`insert into checklist_templates(name) values('Базовая проверка упаковки') returning id`;
    const [tp] =
      await tx`insert into checklist_template_versions(template_id,number,items) values(${template.id},1,${tx.json(checklist)}) returning id`;
    const names = [
      "Зелёный чай · коробка",
      "Чёрный чай · коробка",
      "Травяной чай · коробка",
      "Подарочный набор",
      "Кофе · дой-пак 250 г",
      "Снеки · этикетка",
      "Снеки · вкладыш",
      "Эко-пакет",
    ];
    const mapping = [0, 0, 0, 1, 2, 3, 3, 4];
    const counts = [3, 2, 1, 2, 1, 1, 1, 1];
    const states = [
      "approved",
      "published",
      "internal_review",
      "changes_requested",
      "approved",
      "fixed",
      "published",
      "fixed",
    ];
    for (let i = 0; i < 8; i++) {
      const pid = projects[mapping[i]];
      const oid = orgs[mapping[i] < 2 ? 1 : mapping[i] < 4 ? 2 : 3];
      const [a] =
        await tx`insert into artworks(project_id,name,packaging_type,deadline,status) values(${pid},${names[i]},${i < 4 ? "Коробка" : i === 4 ? "Дой-пак" : "Этикетка"},'2026-11-10',${states[i] === "approved" ? "production" : states[i] === "published" ? "review" : "in_progress"}) returning id`;
      await tx`insert into brief_versions(artwork_id,number,content,author_id) values(${a.id},1,${tx.json({ dimensions: "120 × 60 × 180", units: "мм", material: "Картон GC1 300 г/м²", printing: "Офсет · CMYK", pages: 1, languages: ["RU", "KZ"], mandatoryText: "Состав, условия хранения, изготовитель", brandColors: "Pantone 5535 C", barcode: "4870001234567", logos: "Вектор, без искажений", finishing: "Матовая ламинация", references: "Коллекция Botanica", comments: "Сохранить естественную цветовую гамму" })},${ids.manager})`;
      let previous: string | null = null;
      let active = "",
        productionFile = "",
        hash = "";
      for (let n = 1; n <= counts[i]; n++) {
        const last = n === counts[i];
        const [v]: any[] =
          await tx`insert into artwork_versions(artwork_id,number,previous_version_id,author_id,changes,status) values(${a.id},${n},${previous},${ids.designer},${n === 1 ? "Первый вариант дизайна" : n === 2 ? "Обновлена типографика и расположение штрихкода" : "Уточнены цвета и обязательные тексты"},${last ? states[i] : "superseded"}) returning id`;
        previous = v.id;
        active = v.id;
        const bytes = demoPdf(
          [
            "GREEN TEA",
            "BLACK TEA",
            "HERBAL TEA",
            "GIFT SET",
            "COFFEE",
            "SNACKS",
            "NATURAL",
            "ECO PACK",
          ][i],
          n,
        );
        hash = sha256(bytes);
        await writeFile(`demo-files/artwork-${i + 1}-v${n}.pdf`, bytes);
        for (const kind of ["source", "preview", "production"]) {
          const fid = randomUUID();
          const path = `${oid}/${a.id}/${v.id}/${fid}`;
          const { error } = await supa.storage
            .from("artworks")
            .upload(path, bytes, {
              contentType: "application/pdf",
              upsert: false,
            });
          if (error) throw error;
          await tx`insert into version_files(id,version_id,kind,storage_path,filename,mime_type,size,sha256) values(${fid},${v.id},${kind},${path},${`botanica-${i + 1}-v${n}-${kind}.pdf`},'application/pdf',${bytes.length},${hash})`;
          if (kind === "production") productionFile = fid;
        }
        if (n === 1 && i < 2) {
          const [r] =
            await tx`insert into approval_rounds(version_id,artwork_id,opened_by,deadline,status,closed_at) values(${v.id},${a.id},${ids.manager},'2026-10-21','superseded',now()) returning id`;
          await tx`insert into approval_participants(round_id,user_id,kind) values(${r.id},${ids.approver},'approver')`;
        }
      }
      await tx`update artworks set active_version_id=${active} where id=${a.id}`;
      let review = "";
      if ([0, 1, 3, 4, 6].includes(i)) {
        const [r] =
          await tx`insert into technical_reviews(version_id,template_version_id,reviewer_id,status) values(${active},${tp.id},${ids.prepress},'ready') returning id`;
        review = r.id;
        for (const label of checklist)
          await tx`insert into technical_review_items(review_id,label,passed) values(${review},${label},true)`;
      }
      if (["approved", "published", "changes_requested"].includes(states[i])) {
        const rr = states[i] === "published" ? "open" : states[i];
        const [r] =
          await tx`insert into approval_rounds(version_id,artwork_id,opened_by,deadline,status,closed_at) values(${active},${a.id},${ids.manager},${i === 6 ? "2026-10-20T12:00:00Z" : "2026-11-05T12:00:00Z"},${rr},${rr === "open" ? null : new Date()}) returning id`;
        const approvers =
          i === 1
            ? [ids.approver, ids.approver2]
            : [mapping[i] < 2 ? ids.approver : ids.clientb];
        for (const uid of approvers) {
          await tx`insert into approval_participants(round_id,user_id,kind) values(${r.id},${uid},'approver')`;
          if (rr !== "open")
            await tx`insert into approval_decisions(round_id,version_id,user_id,result,comment,sha256) values(${r.id},${active},${uid},${rr},${rr === "approved" ? "Макет проверен. Согласовано." : "Просьба увеличить логотип и исправить состав."},${hash})`;
        }
        if (states[i] === "approved") {
          const [pkg] =
            await tx`insert into production_packages(number,project_id,artwork_id,version_id,approval_round_id,technical_review_id,file_id,sha256,issued_by) values(${`QP-2026-00${i + 1}`},${pid},${a.id},${active},${r.id},${review},${productionFile},${hash},${ids.manager}) returning id`;
          await tx`insert into production_package_files(package_id,file_id) values(${pkg.id},${productionFile})`;
          if (i === 4) {
            await tx`insert into package_revocations(package_id,user_id,reason) values(${pkg.id},${ids.manager},'Тираж приостановлен: изменились обязательные тексты')`;
            await tx`update production_packages set status='revoked' where id=${pkg.id}`;
          }
        }
      }
      if (i < 3) {
        for (const visibility of ["client", "internal"]) {
          const [th] =
            await tx`insert into comment_threads(version_id,author_id,page,x,y,visibility,type) values(${active},${visibility === "client" ? ids.approver : ids.prepress},1,${visibility === "client" ? 0.28 : 0.72},${visibility === "client" ? 0.35 : 0.67},${visibility},${visibility === "client" ? "design" : "technical"}) returning id`;
          await tx`insert into comments(thread_id,author_id,body) values(${th.id},${visibility === "client" ? ids.approver : ids.prepress},${visibility === "client" ? "Пожалуйста, проверьте отступ от логотипа. Название должно хорошо читаться." : "Внутренняя проверка: согласовать профиль печатной машины и компенсацию растискивания."})`;
        }
      }
      await tx`insert into audit_logs(actor_id,project_id,action,entity_id) values(${ids.manager},${pid},'version.create',${active})`;
      await tx`insert into notifications(user_id,project_id,kind,message) values(${ids.manager},${pid},${states[i] === "approved" ? "package.issue" : "version.create"},'Обновление макета')`;
    }
  });
  await sql.end();
  console.log(
    "Seed complete: 10 accounts, 3 clients, 5 projects, 8 artworks, 12 versions and private PDFs.",
  );
}
seed().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
