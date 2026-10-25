// Read-only captures of the isolated local demo. Never run against production.
import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const origin = "http://127.0.0.1:3000";
const folder = "docs/review/packapprove-3";
await mkdir(folder, { recursive: true });
await mkdir("/tmp/pack3-frames", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const manifest = {
  capturedAt: new Date().toISOString(),
  origin,
  renderer: "Chromium / WebGL2 / ANGLE SwiftShader",
  mobile: "iPhone 13 emulation in Chromium",
  captures: [],
  pageErrors: [],
};
async function context(mobile = false) {
  const c = await browser.newContext(
    mobile
      ? { ...devices["iPhone 13"] }
      : { viewport: { width: 1600, height: 1120 }, deviceScaleFactor: 1 },
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => manifest.pageErrors.push(e.message));
  return { c, p };
}
async function ready(p) {
  await p.locator(".can-stage[data-webgl=ready]").waitFor({ timeout: 45000 });
  await p.waitForFunction(() =>
    /^[a-f0-9]{64}$/.test(
      document.querySelector(".can-studio")?.dataset.textureHash || "",
    ),
  );
  await p.locator(".can-loading-overlay").waitFor({ state: "hidden" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(650);
}
async function shot(p, name, fullPage = true) {
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll("canvas.pdf-canvas")].every(
        (c) => c.dataset.rendered === "true",
      ),
    undefined,
    { timeout: 15000 },
  );
  await p.screenshot({ path: `${folder}/${name}.png`, fullPage });
  manifest.captures.push({
    file: `${name}.png`,
    url: p.url(),
    studio: await p
      .locator(".can-studio")
      .evaluateAll((els) => els.map((e) => ({ ...e.dataset }))),
  });
}
async function login(p, role) {
  await p.goto(`${origin}/login`);
  await p.getByLabel("Электронная почта").fill(`${role}@packapprove.local`);
  await p.getByLabel("Пароль", { exact: true }).fill("PackApprove2026!");
  await p
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await p.locator(".user-card").waitFor();
}
try {
  const { c, p } = await context();
  await p.goto(`${origin}/login`);
  await p.evaluate(() => document.fonts.ready);
  await shot(p, "01-login");
  await p.goto(`${origin}/can-lab`);
  await ready(p);
  await shot(p, "02-standard-450");
  await p.getByRole("button", { name: "Сверху", exact: true }).click();
  await p.waitForTimeout(650);
  await shot(p, "03-metal-lid");
  await p.getByRole("button", { name: "Под углом", exact: true }).click();
  await p.waitForTimeout(450);
  await p.locator(".can-stage").focus();
  for (let n = 0; n < 22; n++) {
    if (n) await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(120);
    await p.locator(".can-stage").screenshot({
      path: `/tmp/pack3-frames/frame-${String(n).padStart(3, "0")}.jpg`,
      type: "jpeg",
      quality: 85,
    });
  }
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    "6",
    "-i",
    "/tmp/pack3-frames/frame-%03d.jpg",
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "32",
    "-b:v",
    "0",
    "-pix_fmt",
    "yuv420p",
    `${folder}/can-rotation.webm`,
  ]);
  await p.locator(".can-demo-tabs button").nth(1).click();
  await ready(p);
  await shot(p, "04-sleek-330-pdf");
  await p.getByLabel("Страница PDF").selectOption("2");
  await ready(p);
  await shot(p, "05-pdf-page-2");
  await p.locator(".can-demo-tabs button").nth(2).click();
  await ready(p);
  await shot(p, "06-slim-250");
  await login(p, "admin");
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot(p, "07-dashboard");
  const state = await (await p.request.get(`${origin}/api/state`)).json();
  const artwork = state.artworks.find((a) => a.name.startsWith("ZHYRA /"));
  if (!artwork) throw Error("Local can seed missing");
  await p.goto(`${origin}/?artwork=${artwork.id}`);
  await p.getByRole("tab", { name: "3D-банка", exact: true }).click();
  await ready(p);
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot(p, "08-private-version");
  await c.close();
  const client = await context();
  await login(client.p, "can-approver");
  await client.p.goto(`${origin}/?artwork=${artwork.id}`);
  await client.p.getByRole("tab", { name: "3D-банка", exact: true }).click();
  await ready(client.p);
  await client.p
    .getByRole("button", { name: "Согласование клиента", exact: true })
    .click();
  await client.p.evaluate(() => window.scrollTo(0, 0));
  await shot(client.p, "09-client-approval");
  await client.c.close();
  const mobile = await context(true);
  await mobile.p.goto(`${origin}/can-lab`);
  await ready(mobile.p);
  await mobile.p.locator(".can-stage").scrollIntoViewIfNeeded();
  await shot(mobile.p, "10-mobile-studio", false);
  await login(mobile.p, "can-approver");
  await mobile.p.goto(`${origin}/?artwork=${artwork.id}`);
  await mobile.p.getByRole("tab", { name: "3D-банка", exact: true }).click();
  await ready(mobile.p);
  await mobile.p.locator(".can-stage").scrollIntoViewIfNeeded();
  await shot(mobile.p, "11-mobile-private", false);
  await mobile.c.close();
  const fallback = await context();
  await fallback.p.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return original.call(this, type, ...args);
    };
  });
  await fallback.p.goto(`${origin}/can-lab`);
  await fallback.p.locator(".can-stage[data-webgl=unavailable]").waitFor();
  await fallback.p
    .getByRole("button", { name: "Открыть 2D", exact: true })
    .click();
  await fallback.p.locator("main img").first().waitFor();
  await shot(fallback.p, "12-fallback-2d");
  await fallback.c.close();
  if (manifest.pageErrors.length)
    throw Error(JSON.stringify(manifest.pageErrors));
} finally {
  await writeFile(
    `${folder}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await browser.close();
}
console.log(
  `Saved ${manifest.captures.length} authentic screenshots and WebGL rotation video.`,
);
