import { localTestOrigin } from "../local-environment";
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
const origin = process.env.INVITATION_TEST_ORIGIN || localTestOrigin();
test.use({ baseURL: origin });
async function login(page: Page, email: string, password = "PackApprove2026!") {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await expect(page.locator(".user-card")).toBeAttached();
}
test("real one-use staff links register designer/prepress; wizard preserves values and creates their assigned project", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = randomUUID().slice(0, 8);
  const password = "InvitedBrowser2026!";
  const members: {
    page: Page;
    context: any;
    email: string;
    name: string;
    link: string;
    role: string;
  }[] = [];
  try {
    await login(page, "admin@packapprove.local");
    await page
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await expect(
      dialog.getByText("Введите название от 2 до 160 символов"),
    ).toBeVisible();
    const project = "E2E invitations " + suffix,
      client = "E2E заказчик " + suffix;
    await dialog.getByLabel("Название проекта", { exact: true }).fill(project);
    await dialog
      .getByLabel("Номер заказа клиента", { exact: true })
      .fill("CAN-" + suffix);
    await dialog
      .getByLabel("Контактное лицо", { exact: true })
      .fill("Команда напитков");
    await dialog
      .getByRole("button", { name: "Добавить клиента", exact: true })
      .click();
    await dialog
      .getByLabel("Название организации", { exact: true })
      .fill(client);
    await dialog
      .getByRole("button", { name: "Добавить заказчика", exact: true })
      .click();
    await expect(dialog.getByLabel("Заказчик", { exact: true })).toContainText(
      client,
    );
    await expect(
      dialog.getByLabel("Название проекта", { exact: true }),
    ).toHaveValue(project);
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    for (const [role, label] of [
      ["designer", "Пригласить дизайнера"],
      ["prepress", "Пригласить допечатника"],
    ]) {
      const email = `browser-${role}-${suffix}@packapprove.local`,
        name = `E2E ${role} ${suffix}`;
      await dialog.getByRole("button", { name: label, exact: true }).click();
      await dialog.getByLabel("Email сотрудника", { exact: true }).fill(email);
      await dialog
        .getByRole("button", { name: "Создать приглашение", exact: true })
        .click();
      const input = dialog.getByRole("textbox", {
        name: "Скопировать ссылку",
        exact: true,
      });
      await expect(input).toHaveValue(/\/invite#token=[a-f0-9]{64}/);
      const link = await input.inputValue();
      const context = await browser.newContext({ baseURL: origin });
      const person = await context.newPage();
      person.on("pageerror", (e) => errors.push(e.message));
      const requests: string[] = [];
      person.on("request", (r) => requests.push(r.url()));
      await person.goto(
        role === "prepress" ? link.replace("#token=", "?token=") : link,
      );
      await expect(person.getByText(email, { exact: true })).toBeVisible();
      await expect(person).toHaveURL(origin + "/invite");
      if (role === "designer")
        expect(requests.some((r) => r.includes("token="))).toBe(false);
      expect(
        requests
          .filter((r) => r.includes("/api/invitations/info"))
          .some((r) => r.includes("token=")),
      ).toBe(false);
      await person.getByLabel("Имя и фамилия", { exact: true }).fill(name);
      await person.getByLabel("Пароль", { exact: true }).fill(password);
      await person
        .getByLabel("Повторите пароль", { exact: true })
        .fill(password);
      await person
        .getByRole("button", { name: "Принять приглашение", exact: true })
        .click();
      await expect(person.locator(".user-card")).toContainText(name, {
        timeout: 15000,
      });
      await person.request.post(origin + "/api/auth/logout");
      await login(person, email, password);
      members.push({ page: person, context, email, name, link, role });
      await dialog
        .getByRole("button", { name: "Обновить список", exact: true })
        .click();
      await dialog
        .getByLabel(
          role === "designer" ? "Дизайнер" : "Допечатная подготовка",
          { exact: true },
        )
        .selectOption({ label: name });
    }
    await dialog.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(
      dialog.getByLabel("Название проекта", { exact: true }),
    ).toHaveValue(project);
    await expect(
      dialog.getByLabel("Номер заказа клиента", { exact: true }),
    ).toHaveValue("CAN-" + suffix);
    await expect(
      dialog.getByLabel("Заказчик", { exact: true }).locator("option:checked"),
    ).toHaveText(client);
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await expect(
      dialog.getByLabel("Дизайнер", { exact: true }).locator("option:checked"),
    ).toHaveText(members[0].name);
    await dialog
      .getByRole("button", { name: "Продолжить", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    await expect(
      dialog.getByText("От 1 до 20 макетов, каждое название — до 160 символов"),
    ).toBeVisible();
    await dialog
      .getByLabel("Названия макетов", { exact: true })
      .fill("ZHYRA / банка 450 мл\nSAIA / банка 330 мл");
    await dialog
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await page.reload();
    const state = await (await page.request.get(origin + "/api/state")).json();
    const saved = state.projects.find((p: any) => p.name === project);
    expect(saved.customer_order).toBe("CAN-" + suffix);
    expect(
      state.artworks.filter((a: any) => a.project_id === saved.id),
    ).toHaveLength(2);
    for (const m of members) {
      const own = await (
        await m.page.request.get(origin + "/api/state")
      ).json();
      expect(own.user.role).toBe(m.role);
      expect(own.projects.some((p: any) => p.id === saved.id)).toBe(true);
      const token = new URL(m.link).hash.slice("#token=".length);
      const replay = await m.page.request.post(
        origin + "/api/invitations/accept",
        { data: { token, password, fullName: m.name } },
      );
      expect(replay.status()).toBe(409);
    }
    expect(errors).toEqual([]);
  } finally {
    for (const m of members) await m.context.close();
  }
});
test("empty employee reference lists offer an invitation action and never skip required assignees", async ({
  page,
}) => {
  await login(page, "admin@packapprove.local");
  // UI-only empty-reference fixture. Commands still reach the actual server.
  await page.route(
    (url) => url.pathname === "/api/state",
    async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.profiles = data.profiles.filter(
        (p: any) => !["designer", "prepress"].includes(p.role),
      );
      await route.fulfill({ response, json: data });
    },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Название проекта", { exact: true })
    .fill("Empty reference validation");
  await dialog.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(dialog.getByText("Пока нет активных дизайнеров.")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Пригласить дизайнера", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(dialog.getByText("Выберите активного дизайнера")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Создать проект", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
