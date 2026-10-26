import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { demoPdf } from "../../scripts/demo-pdf";
import { localTestOrigin } from "../local-environment";
const password = "PackApprove2026!";
test("PDF zoom reuses the loaded document and does not download the private file again", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "manager@packapprove.local", password },
  });
  const s = await (await page.request.get("/api/state")).json(),
    f = s.files.find(
      (f: any) => f.kind === "preview" && f.mime_type === "application/pdf",
    ),
    v = s.versions.find((v: any) => v.id === f.version_id);
  let reads = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/files/" + f.id) reads++;
  });
  await page.goto(`/?artwork=${v.artwork_id}&version=${v.id}&mode=2d`);
  const canvas = page.locator(".viewer-section canvas.pdf-canvas").first();
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  const initial = reads,
    width = await canvas.getAttribute("width");
  expect(initial).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Увеличить масштаб", exact: true })
    .click();
  await expect(canvas).not.toHaveAttribute("width", width!);
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  expect(reads).toBe(initial);
});
test("stale client tab is rejected and opens the current saved version through the error action", async ({
  page,
  playwright,
}) => {
  test.setTimeout(90000);
  const contexts: APIRequestContext[] = [];
  const artworkTitle = "Контроль вкладки " + randomUUID().slice(0, 8);
  const api = async (role: string) => {
    const c = await playwright.request.newContext({
      baseURL: localTestOrigin(),
    });
    contexts.push(c);
    expect(
      (
        await c.post("/api/auth/login", {
          data: { email: role + "@packapprove.local", password },
        })
      ).ok(),
    ).toBe(true);
    return c;
  };
  const command = async (
    c: APIRequestContext,
    action: string,
    id?: string,
    payload: object = {},
    rowVersion?: number,
  ) => {
    const r = await c.post("/api/command", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { action, entityId: id, payload, rowVersion },
    });
    expect(r.status(), action).toBe(200);
    return r.json();
  };
  try {
    const manager = await api("manager"),
      designer = await api("designer"),
      prepress = await api("prepress"),
      s = await (await manager.get("/api/state")).json();
    const project = await command(manager, "project.create", undefined, {
      name: "Quality stale " + randomUUID().slice(0, 8),
      organizationId: s.organizations.find(
        (o: any) => o.name === "ТОО «Tea House Kazakhstan»",
      ).id,
      designerId: s.profiles.find((p: any) => p.full_name === "Арман Касымов")
        .id,
      prepressId: s.profiles.find((p: any) => p.full_name === "Тимур Ахметов")
        .id,
      deadline: "2026-12-20",
      artworks: [artworkTitle],
    });
    let snapshot = await (await manager.get("/api/state")).json(),
      art = snapshot.artworks.find((a: any) => a.project_id === project.id);
    const template = s.templates[0],
      approver = s.profiles.find((p: any) => p.full_name === "Айгерим Нурлан");
    const publish = async (number: number) => {
      snapshot = await (await manager.get("/api/state")).json();
      art = snapshot.artworks.find((a: any) => a.id === art.id);
      const v = await command(
        designer,
        "version.create",
        art.id,
        {
          changes: "V" + number,
          files: ["preview", "production"].map((kind) => ({
            kind,
            filename: "stale-" + number + ".pdf",
            base64: demoPdf().toString("base64"),
          })),
        },
        art.row_version,
      );
      await command(designer, "version.submit", v.id);
      await command(prepress, "review.complete", v.id, {
        status: "ready",
        templateId: template.id,
        items: template.items.map((label: string) => ({ label, passed: true })),
      });
      await command(manager, "round.open", v.id, {
        approvers: [approver.id],
        deadline: "2026-12-20T00:00:00Z",
      });
      return v;
    };
    const first = await publish(1);
    await page.request.post("/api/auth/login", {
      data: { email: "approver@packapprove.local", password },
    });
    await page.goto("/?artwork=" + art.id);
    await expect(page.locator(".large-version")).toHaveText("V1");
    await publish(2);
    const area = (await page.locator(".mobile-decision-bar").isVisible())
      ? page.locator(".mobile-decision-bar")
      : page.locator(".decision-actions");
    await area
      .getByRole("button", { name: "Утвердить версию", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").check();
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/command",
    );
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    expect((await response).status()).toBe(409);
    await dialog
      .getByRole("link", { name: "Открыть актуальную версию", exact: true })
      .click();
    await expect(page.locator(".large-version")).toHaveText("V2");
    await page.reload();
    await expect(page.locator(".large-version")).toHaveText("V2");
    await page.goto("/?view=clientHistory");
    await page
      .locator("button.history-row")
      .filter({ hasText: artworkTitle })
      .filter({ hasText: "V1" })
      .click();
    await expect(page).toHaveURL(new RegExp("version=" + first.id));
    await page.reload();
    await expect(page.locator(".large-version")).toHaveText("V1");
  } finally {
    for (const c of contexts) await c.dispose();
  }
});
