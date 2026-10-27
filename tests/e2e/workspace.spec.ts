import { test, expect, type Page } from "@playwright/test";
import { OwnedFixture } from "./support/owned-fixture";

async function login(
  page: Page,
  role = "manager",
  password = "PackApprove2026!",
) {
  await page.goto("/login");
  await page
    .getByLabel("Электронная почта")
    .fill(role.includes("@") ? role : `${role}@packapprove.local`);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".sidebar .user-card")).toBeAttached();
}
const commandResponse = (page: Page, action: string) =>
  page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/command" &&
      r.request().method() === "POST" &&
      r.request().postDataJSON().action === action,
  );

test("manager dashboard, project creation persists, RU/KZ, artwork PDF and annotations", async ({
  page,
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await fixture.browser(page);
    const admin = await fixture.login("admin");
    const org = await fixture.organization(admin);
    const setup = await fixture.state(admin, { view: "setup" });
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Обзор заказов" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("dashboard.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    const projectName = "CI UI project " + fixture.nonce;
    await modal
      .getByLabel("Название проекта", { exact: true })
      .fill(projectName);
    await modal.getByLabel("Заказчик", { exact: true }).selectOption(org.id);
    await modal
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    // Explicit seed staff are read-only identities; never depend on the first profile/default.
    await modal
      .getByLabel("Дизайнер", { exact: true })
      .selectOption(
        setup.profiles.find((p: any) => p.full_name === "Арман Касымов").id,
      );
    await modal
      .getByLabel("Допечатная подготовка", { exact: true })
      .selectOption(
        setup.profiles.find((p: any) => p.full_name === "Тимур Ахметов").id,
      );
    await modal
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await modal.getByLabel("Названия макетов").fill("Тестовая банка");
    const created = commandResponse(page, "project.create");
    await modal
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    const response = await created;
    expect(response.status()).toBe(200);
    const project = await response.json();
    await expect(modal).toBeHidden();
    await expect(page.locator("main h1")).toHaveText(projectName);
    await page.reload();
    await expect(page.locator("main h1")).toHaveText(projectName);
    const details = await fixture.state(admin, {
      view: "project",
      project: project.id,
    });
    const artwork = details.artworks[0];
    const designer = await fixture.login("designer");
    for (let n = 1; n <= 3; n++) await fixture.version(designer, artwork.id, n);
    await page.goto("/?view=projects");
    await page.locator(".catalog-search input").fill(projectName);
    await page
      .locator(".project-studio-card")
      .filter({ hasText: projectName })
      .click();
    await page
      .locator(".artwork-card")
      .filter({ hasText: "Тестовая банка" })
      .click();
    await expect(page.locator(".large-version")).toContainText("V3");
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
    );
    // Every test has a new PDF, so existing markers cannot intercept this click.
    await page.locator("canvas").click({ position: { x: 90, y: 140 } });
    await expect(page.getByRole("dialog")).toBeVisible();
    const text = "CI marker " + fixture.nonce;
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
    const saved = commandResponse(page, "comment.create");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
    );
    await page.screenshot({
      path: info.outputPath("artwork.png"),
      fullPage: true,
    });
    await page.locator(".topbar .language").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "kk");
    await expect(
      page.getByRole("button", { name: "Салыстыру", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});

test("client cannot see internal comments and can record a durable decision", async ({
  page,
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  try {
    await fixture.browser(page);
    const f = await fixture.approval();
    const confidential = "INTERNAL CI confidential " + fixture.nonce;
    await fixture.command(f.designer, "comment.create", f.version.id, {
      body: confidential,
      visibility: "internal",
      type: "technical",
      page: 1,
      x: 0.5,
      y: 0.5,
    });
    await login(page, f.first.email, f.first.password);
    await page.goto("/?artwork=" + f.artwork.id);
    await page
      .locator(".studio-tabs")
      .getByRole("button", { name: /Комментарии/ })
      .click();
    await expect(page.locator(".threads")).not.toContainText(confidential);
    const before = await fixture.state(f.first.api, {
      view: "artwork",
      artwork: f.artwork.id,
    });
    expect(before.threads.some((t: any) => t.visibility === "internal")).toBe(
      false,
    );
    expect(before.comments.some((c: any) => c.body === confidential)).toBe(
      false,
    );
    await page
      .getByRole("button", { name: "Согласование клиента", exact: true })
      .click();
    const actions = (await page.locator(".mobile-decision-bar").isVisible())
      ? page.locator(".mobile-decision-bar")
      : page.locator(".decision-actions");
    await actions
      .getByRole("button", { name: "Утвердить версию", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("checkbox").check();
    const saved = commandResponse(page, "decision.create");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    expect(
      (await saved).status(),
      "decision API must commit before the dialog is dismissed",
    ).toBe(200);
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await page
      .getByRole("button", { name: "Согласование клиента", exact: true })
      .click();
    await expect(page.locator(".decision-record").first()).toBeVisible();
    await expect(page.locator(".participant")).toHaveCount(3);
    const after = await fixture.state(f.first.api, {
      view: "artwork",
      artwork: f.artwork.id,
    });
    expect(
      after.participants.filter((p: any) => p.kind === "approver"),
    ).toHaveLength(2);
    expect(after.decisions).toHaveLength(1);
    expect(after.decisions[0].user_id).toBe(f.first.id);
    expect(after.decisions[0].version_id).toBe(f.version.id);
    expect(after.decisions[0].sha256).toBe(
      after.files.find((file: any) => file.kind === "preview").sha256,
    );
    expect(after.rounds[0].status).toBe("open"); // "All" requires the second independent approver.
  } finally {
    await fixture.cleanup();
  }
});

test("production sees packages; revoked package server download is denied", async ({
  page,
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  try {
    await fixture.browser(page);
    const f = await fixture.approval();
    for (const person of [f.first, f.secondApprover])
      await fixture.command(person.api, "decision.create", f.round.id, {
        result: "approved",
      });
    const issued = await fixture.command(
      f.admin,
      "package.issue",
      f.version.id,
    );
    const d = await fixture.state(f.admin, {
      view: "artwork",
      artwork: f.artwork.id,
    });
    const pkg = d.packages.find((p: any) => p.id === issued.id);
    await fixture.command(
      f.admin,
      "package.revoke",
      issued.id,
      { reason: "CI owned revocation" },
      pkg.row_version,
    );
    await login(page, "production");
    await expect(
      page.getByRole("heading", {
        name: "Производственные комплекты",
        exact: true,
      }),
    ).toBeVisible();
    const revoked = page
      .locator(".revoked-card")
      .filter({ hasText: f.project.name });
    await expect(revoked).toBeVisible();
    await expect(
      revoked.getByRole("link", { name: "Скачать файл" }),
    ).toHaveCount(0);
    const response = await page.request.get(`/api/packages/${issued.id}`);
    expect(response.status()).toBe(410);
  } finally {
    await fixture.cleanup();
  }
});
