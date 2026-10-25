import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { demoPdf } from "../../scripts/demo-pdf";
async function login(page: any, role = "manager") {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill(`${role}@packapprove.local`);
  await page.getByLabel("Пароль", { exact: true }).fill("PackApprove2026!");
  await page
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".sidebar .user-card")).toBeAttached();
}
test("manager dashboard, project creation persists, RU/KZ, artwork PDF and annotations", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Всё под контролем" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  const projectName = "E2E " + Date.now();
  await modal.getByLabel("Название", { exact: true }).fill(projectName);
  await modal.getByLabel("Названия макетов").fill("Тестовая коробка");
  await modal.getByRole("button", { name: "Создать проект" }).click();
  await expect(modal).toBeHidden();
  await page.reload();
  await expect(
    page.locator(".project-table").getByText(projectName, { exact: true }),
  ).toBeVisible();
  await page
    .locator(".project-table")
    .getByText("Линейка чая Botanica", { exact: true })
    .click();
  await page
    .locator(".artwork-card")
    .filter({ hasText: "Зелёный чай" })
    .click();
  await expect(page.locator(".large-version")).toContainText("V3");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute("data-rendered", "true");
  const spot = await page.locator(".preview-document").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const marks = Array.from(el.querySelectorAll(".comment-pin")).map((pin) => {
      const p = pin.getBoundingClientRect();
      return { x: p.x + p.width / 2 - r.x, y: p.y + p.height / 2 - r.y };
    });
    for (let y = 100; y < 360; y += 40)
      for (let x = 50; x < 210; x += 40)
        if (marks.every((p) => Math.hypot(p.x - x, p.y - y) > 30))
          return { x, y };
    throw Error("No unmarked position");
  });
  await page.locator("canvas").click({ position: spot });
  await expect(page.getByRole("dialog")).toBeVisible();
  const text = "E2E marker " + Date.now();
  await page
    .getByRole("dialog")
    .getByLabel("Комментарии", { exact: true })
    .first()
    .fill(text);
  await page
    .getByRole("dialog")
    .getByRole("combobox")
    .last()
    .selectOption("design");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute("data-rendered", "true");
  await page.screenshot({
    path: `test-results/artwork-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator(".topbar .language").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  await expect(
    page.getByRole("button", { name: "Салыстыру", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("client cannot see internal comments and can record a durable decision", async ({
  page,
  playwright,
}) => {
  const contexts: any[] = [];
  async function api(role: string) {
    const ctx = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    contexts.push(ctx);
    const r = await ctx.post("/api/auth/login", {
      data: {
        email: `${role}@packapprove.local`,
        password: "PackApprove2026!",
      },
    });
    expect(r.status()).toBe(200);
    return ctx;
  }
  async function act(
    ctx: any,
    action: string,
    entityId: string | undefined,
    payload: any = {},
    rowVersion?: number,
  ) {
    const r = await ctx.post("/api/command", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { action, entityId, payload, rowVersion },
    });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  }
  try {
    const manager = await api("manager");
    const d = await (await manager.get("/api/state")).json();
    const org = d.organizations.find(
      (o: any) => o.name === "ТОО «Tea House Kazakhstan»",
    );
    const project = await act(manager, "project.create", undefined, {
      name: "E2E approval " + randomUUID().slice(0, 8),
      organizationId: org.id,
      designerId: d.profiles.find((p: any) => p.role === "designer").id,
      prepressId: d.profiles.find((p: any) => p.role === "prepress").id,
      deadline: "2026-12-20",
      artworks: ["E2E client artwork"],
    });
    const state = await (await manager.get("/api/state")).json();
    const a = state.artworks.find((a: any) => a.project_id === project.id);
    const designer = await api("designer");
    const v = await act(
      designer,
      "version.create",
      a.id,
      {
        changes: "E2E approval",
        files: ["preview", "production"].map((kind) => ({
          kind,
          filename: "e2e.pdf",
          base64: demoPdf().toString("base64"),
        })),
      },
      a.row_version,
    );
    await act(designer, "version.submit", v.id);
    await act(designer, "comment.create", v.id, {
      body: "INTERNAL E2E confidential",
      visibility: "internal",
      type: "technical",
      page: 1,
      x: 0.5,
      y: 0.5,
    });
    const prepress = await api("prepress");
    const template = d.templates[0];
    await act(prepress, "review.complete", v.id, {
      templateId: template.id,
      status: "ready",
      items: template.items.map((label: string) => ({ label, passed: true })),
    });
    const approvers = d.profiles
      .filter(
        (p: any) =>
          p.role === "approver" &&
          d.memberships.some(
            (m: any) => m.user_id === p.id && m.organization_id === org.id,
          ),
      )
      .map((p: any) => p.id);
    await act(manager, "round.open", v.id, {
      approvers,
      deadline: "2026-12-20T12:00:00Z",
    });
    await login(page, "approver");
    await page.goto("/?artwork=" + a.id);
    await expect(page.locator(".threads")).not.toContainText(
      "INTERNAL E2E confidential",
    );
    await page
      .getByRole("button", { name: "Согласование клиента", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Утвердить версию", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await page
      .getByRole("button", { name: "Согласование клиента", exact: true })
      .click();
    await expect(page.locator(".decision-record").first()).toBeVisible();
    await expect(page.locator(".participant")).toHaveCount(2);
  } finally {
    for (const ctx of contexts) await ctx.dispose();
  }
});
test("production sees packages; revoked package server download is denied", async ({
  page,
  request,
}) => {
  await login(page, "production");
  await expect(
    page.getByRole("heading", {
      name: "Производственные комплекты",
      exact: true,
    }),
  ).toBeVisible();
  const revoked = page.locator(".revoked-card").first();
  await expect(revoked).toBeVisible();
  await expect(revoked.getByRole("link", { name: "Скачать файл" })).toHaveCount(
    0,
  );
  const state = await (await page.request.get("/api/state")).json();
  const p = state.packages.find((p: any) => p.status === "revoked");
  const r = await page.request.get(`/api/packages/${p.id}`);
  expect(r.status()).toBe(410);
});
