import { test, expect, type Page } from "@playwright/test";
import { OwnedFixture } from "./support/owned-fixture";
async function openDecision(page: Page, f: any) {
  await page.goto("/login");
  await page
    .getByLabel("Электронная почта", { exact: true })
    .fill(f.first.email);
  await page.getByLabel("Пароль", { exact: true }).fill(f.first.password);
  await page
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await expect(page.locator(".user-card")).toBeAttached();
  await page.goto("/?artwork=" + f.artwork.id);
  const actions = (await page.locator(".mobile-decision-bar").isVisible())
    ? page.locator(".mobile-decision-bar")
    : page.locator(".decision-actions");
  await actions
    .getByRole("button", { name: "Утвердить версию", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("checkbox").check();
}
test("committed decision closes before slow or failed state revalidation", async ({
  page,
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let committed = false,
    calls = 0;
  try {
    await fixture.browser(page);
    const f = await fixture.approval();
    await openDecision(page, f);
    await page.route(
      (u) => u.pathname === "/api/command",
      async (route) => {
        if (route.request().postDataJSON().action === "decision.create") {
          calls++;
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          committed = true;
          await route.fulfill({ response });
        } else await route.continue();
      },
    );
    await page.route(
      (u) => u.pathname === "/api/state",
      async (route) => {
        if (committed) {
          await gate;
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Временная ошибка обновления данных",
            }),
          });
        }
        await route.continue();
      },
    );
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/command" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 1500 });
    expect(calls).toBe(1);
    await expect(
      page.getByRole("button", { name: "Утвердить версию", exact: true }),
    ).toHaveCount(0);
    release();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Изменения сохранены, но данные не обновились" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Утвердить версию", exact: true }),
    ).toHaveCount(0);
    const own = await fixture.state(f.first.api, {
      view: "artwork",
      artwork: f.artwork.id,
    });
    expect(
      own.decisions.filter(
        (d: any) => d.round_id === f.round.id && d.user_id === f.first.id,
      ),
    ).toHaveLength(1);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await fixture.cleanup();
  }
});
test("API error stays visible in the decision dialog and does not create a decision", async ({
  page,
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  try {
    await fixture.browser(page);
    const f = await fixture.approval();
    await openDecision(page, f);
    await page.route(
      (u) => u.pathname === "/api/command",
      (route) =>
        route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Проверка временно недоступна. Повторите попытку.",
          }),
        }),
    );
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/command",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    expect((await response).status()).toBe(502);
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Проверка временно недоступна",
    );
    await expect(page.getByRole("dialog").getByRole("checkbox")).toBeChecked();
    const d = await fixture.state(f.first.api, {
      view: "artwork",
      artwork: f.artwork.id,
    });
    expect(
      d.decisions.filter((d: any) => d.round_id === f.round.id),
    ).toHaveLength(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await fixture.cleanup();
  }
});
test("lost success response retries the same idempotency key and records one exact decision", async ({
  page,
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  try {
    await fixture.browser(page);
    const f = await fixture.approval();
    await openDecision(page, f);
    const keys: string[] = [];
    await page.route(
      (u) => u.pathname === "/api/command",
      async (route) => {
        const request = route.request();
        if (request.postDataJSON().action !== "decision.create")
          return route.continue();
        keys.push(request.headers()["idempotency-key"]);
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (keys.length === 1) await route.abort("connectionreset");
        else await route.fulfill({ response });
      },
    );
    const save = () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Сохранить", exact: true });
    await save().click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await save().click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    const d = await fixture.state(f.first.api, {
      view: "artwork",
      artwork: f.artwork.id,
    });
    const own = d.decisions.filter(
      (d: any) => d.round_id === f.round.id && d.user_id === f.first.id,
    );
    expect(own).toHaveLength(1);
    expect(own[0].sha256).toBe(
      d.files.find(
        (file: any) =>
          file.version_id === f.version.id && file.kind === "preview",
      ).sha256,
    );
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await fixture.cleanup();
  }
});

test("double activation while the response is pending sends one decision", async ({
  page,
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  try {
    await fixture.browser(page);
    const f = await fixture.approval();
    await openDecision(page, f);
    await page.route(
      (u) => u.pathname === "/api/command",
      async (route) => {
        if (route.request().postDataJSON().action !== "decision.create")
          return route.continue();
        calls++;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await gate;
        await route.fulfill({ response });
      },
    );
    const save = page.getByRole("dialog").locator("button.primary");
    // One physical double click; hold the actual committed response in flight.
    await save.dblclick();
    await expect(save).toBeDisabled();
    await expect.poll(() => calls).toBe(1);
    release();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(calls).toBe(1);
    const state = await fixture.state(f.first.api, {
      view: "artwork",
      artwork: f.artwork.id,
    });
    expect(
      state.decisions.filter(
        (d: any) => d.round_id === f.round.id && d.user_id === f.first.id,
      ),
    ).toHaveLength(1);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await fixture.cleanup();
  }
});
