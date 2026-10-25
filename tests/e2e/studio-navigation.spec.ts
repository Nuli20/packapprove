import { test, expect } from "@playwright/test";
test("distinct operational views preserve browser back/forward and direct links", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("admin@packapprove.local");
  await page.getByLabel("Пароль", { exact: true }).fill("PackApprove2026!");
  await page
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await expect(page.locator(".user-card")).toBeAttached();
  const views = [
    ["projects", "Проекты"],
    ["tasks", "Мои задачи"],
    ["internal", "Внутренняя проверка"],
    ["approval", "На согласовании"],
    ["changes", "Требуют исправлений"],
    ["ready", "Готовы к производству"],
  ];
  for (const [view, title] of views) {
    if (await page.locator(".mobile-menu").isVisible())
      await page.locator(".mobile-menu").click();
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: new RegExp("^" + title) })
      .click();
    await expect(page).toHaveURL(new RegExp("view=" + view));
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".dashboard-columns")).toHaveCount(0);
    if (view === "projects")
      await expect(page.locator(".catalog-toolbar")).toBeVisible();
    else await expect(page.locator(".section-intro")).toBeVisible();
  }
  await page.goBack();
  await expect(page).toHaveURL(/view=changes/);
  await expect(page.locator("main h1")).toHaveText("Требуют исправлений");
  await page.goForward();
  await expect(page).toHaveURL(/view=ready/);
  await expect(page.locator("main h1")).toHaveText("Готовы к производству");
  await page.reload();
  await expect(page.locator("main h1")).toHaveText("Готовы к производству");
  await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
});
