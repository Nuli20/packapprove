import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
test("six demo cabinets use real Auth sessions, actual can orders and unchanged role boundaries", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [role, name] of [
    ["admin", "Администратор"],
    ["manager", "Менеджер"],
    ["designer", "Дизайнер"],
    ["prepress", "Допечатная подготовка"],
    ["approver", "Клиент-согласующий"],
    ["production", "Производство"],
  ]) {
    await page.goto("/demo");
    await page
      .getByRole("button", { name: "Открыть кабинет: " + name, exact: true })
      .click();
    await expect(page.locator(".user-card")).toBeAttached();
    await expect(
      page.getByRole("complementary", {
        name: "Демонстрационная среда",
        exact: true,
      }),
    ).toBeVisible();
    const state = await (await page.request.get("/api/state")).json();
    expect(state.user.role).toBe(role);
    if (role === "production") {
      const pkg = state.packages.find(
        (p: any) =>
          state.artworks.some(
            (a: any) => a.id === p.artwork_id && a.name.startsWith("TUN /"),
          ) && p.status === "transferred",
      );
      expect(pkg).toBeTruthy();
      const file = await page.request.get("/api/packages/" + pkg.id);
      expect(file.status()).toBe(200);
      expect(
        createHash("sha256")
          .update(await file.body())
          .digest("hex"),
      ).toBe(pkg.sha256);
      expect(state.invitations).toHaveLength(0);
    } else
      expect(state.projects.some((p: any) => p.name.startsWith("DEMO /"))).toBe(
        true,
      );
    if (role === "designer") {
      const task = state.artworks.find(
        (a: any) => a.name === "ZHYRA / подготовка дизайна / 450 мл",
      );
      expect(task).toBeTruthy();
      expect(
        state.versions.find((v: any) => v.id === task.active_version_id).status,
      ).toBe("fixed");
      await expect(
        page.locator(".queue-card").filter({ hasText: task.name }),
      ).toBeVisible();
    }
    if (role === "approver") {
      expect(state.threads.every((t: any) => t.visibility === "client")).toBe(
        true,
      );
      const upload = await page.request.post("/api/uploads/prepare", {
        data: {},
      });
      expect(upload.status()).toBe(403);
      await expect(
        page.getByRole("button", { name: "Создать проект", exact: true }),
      ).toHaveCount(0);
    }
    await expect(page.locator(".sidebar")).not.toContainText(
      "Одна версия. Полная уверенность",
    );
    await expect(page.locator('.sidebar a[href="/can-lab"]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
