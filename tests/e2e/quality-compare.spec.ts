import { test, expect } from "@playwright/test";
test("comparison keeps its two saved versions after reload and synchronizes PDF zoom", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { email: "manager@packapprove.local", password: "PackApprove2026!" },
  });
  const s = await (await page.request.get("/api/state")).json(),
    a = s.artworks.find((a: any) => a.name.includes("Зелёный чай")),
    versions = s.versions
      .filter((v: any) => v.artwork_id === a.id)
      .sort((x: any, y: any) => y.number - x.number);
  await page.goto(
    `/?artwork=${a.id}&version=${versions[0].id}&mode=compare&compare=${versions[2].id}`,
  );
  const canvases = page.locator(".compare-stage canvas.pdf-canvas");
  await expect(canvases).toHaveCount(2);
  for (const canvas of await canvases.all())
    await expect(canvas).toHaveAttribute("data-rendered", "true");
  const choice = page.getByRole("combobox", { name: "Сравнить", exact: true });
  await expect(choice).toHaveValue(versions[2].id);
  await page.reload();
  await expect(choice).toHaveValue(versions[2].id);
  for (const canvas of await canvases.all())
    await expect(canvas).toHaveAttribute("data-rendered", "true");
  const widths = await canvases.evaluateAll((items) =>
    items.map((c) => (c as HTMLCanvasElement).width),
  );
  await page
    .getByRole("button", { name: "Увеличить масштаб", exact: true })
    .click();
  await expect
    .poll(async () => {
      const current = await canvases.evaluateAll((items) =>
        items.map((c) => (c as HTMLCanvasElement).width),
      );
      return current.length === 2 && current.every((w, i) => w > widths[i]);
    })
    .toBe(true);
  await choice.selectOption(versions[1].id);
  await expect(page).toHaveURL(new RegExp("compare=" + versions[1].id));
  await page.reload();
  await expect(choice).toHaveValue(versions[1].id);
});
