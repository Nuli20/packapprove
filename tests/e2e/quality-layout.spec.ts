import { test, expect } from "@playwright/test";
const views: Record<string, string[]> = {
  admin: [
    "home",
    "projects",
    "tasks",
    "internal",
    "approval",
    "changes",
    "ready",
    "packages",
    "clients",
    "settings",
    "reports",
    "audit",
    "notifications",
  ],
  manager: [
    "home",
    "projects",
    "tasks",
    "internal",
    "approval",
    "changes",
    "ready",
    "packages",
    "clients",
    "settings",
    "reports",
    "notifications",
  ],
  designer: [
    "home",
    "projects",
    "tasks",
    "changes",
    "internal",
    "approval",
    "notifications",
  ],
  prepress: [
    "home",
    "internal",
    "tasks",
    "projects",
    "changes",
    "approval",
    "notifications",
  ],
  observer: [
    "home",
    "projects",
    "allArtworks",
    "approvedVersions",
    "clientComments",
    "clientHistory",
    "notifications",
  ],
  "can-approver": [
    "home",
    "projects",
    "approval",
    "allArtworks",
    "approvedVersions",
    "clientComments",
    "clientHistory",
    "notifications",
  ],
  production: ["packages", "notifications"],
};
for (const [role, routes] of Object.entries(views))
  test(`role routes and readable layout: ${role}`, async ({ page }) => {
    test.setTimeout(100000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const auth = await page.request.post("/api/auth/login", {
      data: {
        email: role + "@packapprove.local",
        password: "PackApprove2026!",
      },
    });
    expect(auth.ok()).toBe(true);
    for (const view of routes) {
      await page.goto("/?view=" + view);
      await expect(page.locator(".user-card")).toBeAttached();
      await expect(page.locator('main[aria-busy="false"]')).toBeAttached();
      await expect(page.locator("main .alert.error")).toHaveCount(0);
      const layout = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(
        layout.scroll,
        `${role}/${view}: horizontal overflow`,
      ).toBeLessThanOrEqual(layout.width);
    }
    expect(errors).toEqual([]);
  });
test("expired session redirects clearly and clears private cabinet", async ({
  page,
  context,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "manager@packapprove.local", password: "PackApprove2026!" },
  });
  await page.goto("/?view=projects");
  await expect(page.locator(".catalog-toolbar")).toBeVisible();
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/login\?reason=session-expired/);
  await expect(page.locator(".catalog-toolbar")).toHaveCount(0);
});

test("logout clears private metadata in another open tab", async ({
  page,
  context,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "manager@packapprove.local", password: "PackApprove2026!" },
  });
  await page.goto("/?view=projects");
  await expect(page.locator(".catalog-toolbar")).toBeVisible();
  const second = await context.newPage();
  await second.goto("/?view=projects");
  await expect(second.locator(".catalog-toolbar")).toBeVisible();
  await page.bringToFront();
  const menu = page.locator(".mobile-menu");
  if (await menu.isVisible()) await menu.click();
  await page.locator(".user-card").click();
  await expect(second).toHaveURL(/login\?reason=session-changed/);
  await expect(second.locator(".catalog-toolbar")).toHaveCount(0);
});
