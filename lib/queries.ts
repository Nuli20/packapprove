import { appendShowcaseSpecs } from "./showcase-spec";
import { isolatedDemoEnabled } from "./demo-environment";
import { asUser } from "./db";
import { assert, sha256, permit } from "./security";
import { storageClient } from "./platform";
import type { User } from "./service";
export async function snapshot(u: User) {
  return asUser(u.id, async (tx) => {
    const projects =
      await tx`select p.*,o.name as organization_name from projects p join organizations o on o.id=p.organization_id order by p.created_at desc`;
    const artworks = await tx`select * from artworks order by created_at`;
    const visualizations = await tx`select * from version_visualizations`;
    const versions =
      await tx`select * from artwork_versions order by number desc`;
    const files =
      await tx`select id,version_id,kind,filename,mime_type,size,sha256,created_at from version_files`;
    const threads = await tx`select * from comment_threads order by created_at`;
    const comments = await tx`select * from comments order by created_at`;
    const rounds =
      await tx`select * from approval_rounds order by created_at desc`;
    const decisions = await tx`select * from approval_decisions`;
    const participants = await tx`select * from approval_participants`;
    const packages =
      await tx`select * from production_packages order by created_at desc`;
    const profiles =
      await tx`select id,full_name,role,active,row_version from profiles`;
    const organizations = await tx`select * from organizations order by name`;
    const memberships = await tx`select * from organization_memberships`;
    const briefs = await tx`select * from brief_versions order by number desc`;
    const templates =
      await tx`select v.*,t.name from checklist_template_versions v join checklist_templates t on t.id=v.template_id order by v.number desc`;
    const reviews = await tx`select * from technical_reviews`;
    const reviewItems = await tx`select * from technical_review_items`;
    const notifications =
      await tx`select * from notifications order by created_at desc limit 100`;
    const audit =
      await tx`select * from audit_logs order by created_at desc limit 150`;
    const resolutions = await tx`select * from comment_resolution_links`;
    const downloads =
      await tx`select * from download_events order by created_at desc limit 100`;
    const revocations = await tx`select * from package_revocations`;
    const acknowledgements = await tx`select * from package_acknowledgements`;
    const invitations =
      await tx`select id,organization_id,email,role,invited_by,accepted_at,expires_at,created_at from invitations order by created_at desc`;
    appendShowcaseSpecs(files,visualizations);
    return {
      user: u,
      demo_context: isolatedDemoEnabled() ? [{ enabled: true }] : [],
      projects,
      artworks,
      versions,
      visualizations,
      files,
      threads,
      comments,
      rounds,
      decisions,
      participants,
      packages,
      profiles,
      organizations,
      memberships,
      briefs,
      templates,
      reviews,
      reviewItems,
      notifications,
      audit,
      resolutions,
      downloads,
      revocations,
      acknowledgements,
      invitations,
    };
  });
}
export async function download(u: User, id: string, isPackage: boolean) {
  return asUser(u.id, async (tx) => {
    let f;
    let pkg;
    if (isPackage) {
      permit(u.role, ["admin", "manager", "production"]);
      pkg = (
        await tx`select * from production_packages where id=${id} for update`
      )[0];
      assert(pkg, "Комплект недоступен", 404);
      assert(
        ["transferred", "received"].includes(pkg.status),
        "Комплект отозван. Скачивание запрещено.",
        410,
      );
      f = (await tx`select * from version_files where id=${pkg.file_id}`)[0];
    } else {
      assert(
        u.role !== "production",
        "Используйте производственный комплект",
        403,
      );
      f = (await tx`select * from version_files where id=${id}`)[0];
    }
    assert(f, "Файл недоступен", 404);
    // Signed capability is never returned to the browser, so revocation cannot be bypassed with a cached URL.
    const { data, error } = await storageClient().createSignedUrl(
      f.storage_path,
      30,
    );
    assert(!error && data, "Хранилище недоступно", 502);
    const response = await fetch(data.signedUrl, { cache: "no-store" });
    assert(response.ok, "Не удалось прочитать файл", 502);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(
      sha256(bytes) === f.sha256 && (!pkg || pkg.sha256 === f.sha256),
      "Нарушена целостность файла",
      502,
    );
    await tx`insert into download_events(package_id,file_id,user_id,sha256) values(${pkg?.id || null},${f.id},${u.id},${f.sha256})`;
    if (pkg) {
      await tx`insert into audit_logs(actor_id,project_id,action,entity_id) values(${u.id},${pkg.project_id},'package.download',${pkg.id})`;
    }
    return { bytes, filename: f.filename, mime: f.mime_type, sha256: f.sha256 };
  });
}
