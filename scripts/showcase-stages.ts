/** Optional local-only presentation. Never run by deployment or by production import. */
import {
  localTestEnvironment,
  localTestOrigin,
} from "../tests/local-environment";
import { request } from "@playwright/test";
import { randomUUID } from "node:crypto";
localTestEnvironment();
const contexts: any[] = [];
async function login(role: string) {
  const api = await request.newContext({
    baseURL: localTestOrigin(),
    extraHTTPHeaders: { "x-forwarded-for": "2001:db8::2026" },
    timeout: 15000,
  });
  contexts.push(api);
  const r = await api.post("/api/auth/login", {
    data: { email: `${role}@packapprove.local`, password: "PackApprove2026!" },
  });
  if (!r.ok()) throw Error("Local login failed");
  return api;
}
async function act(
  api: any,
  action: string,
  entityId?: string,
  payload = {},
  rowVersion?: number,
) {
  const r = await api.post("/api/command", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { action, entityId, payload, rowVersion },
  });
  if (!r.ok()) throw Error(`Local stage ${action} failed (${r.status()})`);
  return r.json();
}
const state = async (api: any, query: string) =>
  (await api.get("/api/state?" + query)).json();
try {
  const admin = await login("admin"),
    designer = await login("designer"),
    prepress = await login("prepress");
  const setup = await state(admin, "view=setup");
  const result = await act(admin, "showcase.import", undefined, {
    confirmed: true,
    designerId: setup.profiles.find((p: any) => p.full_name === "Арман Касымов")
      .id,
    prepressId: setup.profiles.find((p: any) => p.full_name === "Тимур Ахметов")
      .id,
  });
  for (const [i, id] of result.projects.entries()) {
    const project = await state(admin, `view=project&project=${id}`),
      a = project.artworks[0];
    let s = await state(admin, `view=artwork&artwork=${a.id}`);
    const v = s.versions.find((v: any) => v.id === a.active_version_id);
    if (i === 0 || v.status !== "fixed") continue;
    await act(designer, "version.submit", v.id);
    if (i === 1) continue;
    const template = setup.templates[0];
    await act(prepress, "review.complete", v.id, {
      templateId: template.id,
      status: "ready",
      notes: "DEMO — NOT FOR PRODUCTION. Только показ тестового процесса.",
      items: template.items.map((label: string) => ({ label, passed: true })),
    });
    const email = `showcase-${id}@packapprove.local`,
      password = "LocalShowcase2026!";
    const invitation = await act(admin, "invitation.create", undefined, {
      email,
      organizationId: project.projects[0].organization_id,
      role: "approver",
    });
    const token = new URL(
      invitation.invitationUrl,
      localTestOrigin(),
    ).hash.slice(7);
    const client = await request.newContext({ baseURL: localTestOrigin() });
    contexts.push(client);
    const accepted = await client.post("/api/invitations/accept", {
      data: { token, password, fullName: "DEMO / " + project.projects[0].name },
    });
    if (!accepted.ok()) throw Error("Local registration failed");
    const user = (await state(client, "view=home")).user;
    const round = await act(admin, "round.open", v.id, {
      approvers: [user.id],
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    if (i === 2) continue;
    if (i === 3) {
      await act(client, "comment.create", v.id, {
        body: "DEMO: увеличить название и проверить контраст.",
        visibility: "client",
        type: "design",
        page: 1,
        x: 0.5,
        y: 0.4,
      });
      await act(client, "decision.create", round.id, {
        result: "changes_requested",
        comment: "DEMO: увеличить название.",
      });
      continue;
    }
    await act(client, "decision.create", round.id, {
      result: "approved",
      comment: "DEMO — NOT FOR PRODUCTION. Только тестовый стенд.",
    });
    if (i === 5) await act(admin, "package.issue", v.id);
  }
  console.log(
    "Six local showcase stages prepared. No production services used.",
  );
} finally {
  for (const api of contexts) await api.dispose();
}
