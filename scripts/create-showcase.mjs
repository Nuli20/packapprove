import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const designs = [
  [
    "solar-pop",
    "SOLAR POP",
    "Лимонная газировка",
    "standard450",
    450,
    66,
    136,
    "#ffdb37",
    "#ee602c",
    "#26291d",
  ],
  [
    "mira-berry",
    "MIRA BERRY",
    "Ягодный напиток",
    "sleek330",
    330,
    58,
    113,
    "#c4e8db",
    "#bc225c",
    "#174842",
  ],
  [
    "volt-x",
    "VOLT X",
    "Энергетический напиток",
    "slim250",
    250,
    53,
    102,
    "#20242a",
    "#c8ff37",
    "#f0f1e9",
  ],
  [
    "luma-tea",
    "LUMA TEA",
    "Холодный чай",
    "sleek330",
    330,
    58,
    113,
    "#d5c6e7",
    "#f6eed8",
    "#504464",
  ],
  [
    "terra-water",
    "TERRA WATER",
    "Газированная вода",
    "standard450",
    450,
    66,
    136,
    "#1545ba",
    "#cbd5df",
    "#f6f1e5",
  ],
  [
    "pink-wave",
    "PINK WAVE",
    "Грейпфрутовый напиток",
    "slim250",
    250,
    53,
    102,
    "#f68b94",
    "#e84949",
    "#632937",
  ],
];
await mkdir("public/showcase", { recursive: true });
let bindings = [];
try {
  bindings = JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile("public/showcase/bindings.json", "utf8"),
  );
} catch {}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const manifest = [];
try {
  for (const [i, d] of designs.entries()) {
    const [
      slug,
      brand,
      name,
      preset,
      volumeMl,
      diameter,
      printHeight,
      bg,
      accent,
      ink,
    ] = d;
    const width = 1600,
      height = Math.round((width * printHeight) / (Math.PI * diameter));
    for (let version = 1; version <= (i % 2 === 0 ? 2 : 1); version++) {
      const motifs = [
        `<circle cx="800" cy="540" r="340" fill="${accent}"/><circle cx="800" cy="540" r="260" fill="none" stroke="${bg}" stroke-width="6"/>`,
        `<path d="M-100 650 Q200 200 420 650 T950 650 T1700 650 V1100 H-100" fill="${accent}"/><circle cx="1100" cy="160" r="120" fill="${accent}"/>`,
        `<path d="M440 -20 H800 L520 400 H970 L460 1000 H220 L590 530 H230Z" fill="${accent}" opacity=".7"/>`,
        `<g fill="none" stroke="${accent}" stroke-width="7">${[0, 1, 2, 3, 4].map((n) => `<ellipse cx="750" cy="540" rx="${190 + n * 40}" ry="${300 - n * 28}" transform="rotate(${n * 22} 750 540)"/>`).join("")}</g>`,
        `<g fill="none" stroke="${accent}" stroke-width="3">${Array.from({ length: 16 }, (_, n) => `<path d="M0 ${400 + n * 24} Q400 ${150 + n * 24} 800 ${400 + n * 24} T1600 ${400 + n * 24}"/>`).join("")}</g>`,
        `<g fill="${accent}">${[0, 1, 2, 3].map((n) => `<path d="M-100 ${250 + n * 190} Q300 ${-20 + n * 190} 800 ${250 + n * 190} T1700 ${250 + n * 190} V${350 + n * 190} Q1100 ${100 + n * 190} 800 ${350 + n * 190} T-100 ${350 + n * 190}Z"/>`).join("")}</g>`,
      ];
      const front = 800,
        size = i === 3 ? 116 : i === 4 ? 100 : 140;
      const words = brand.split(" ");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1600 ${height}"><rect width="1600" height="${height}" fill="${bg}"/>${motifs[i]}<g fill="${ink}" font-family="Arial,sans-serif"><text x="${front}" y="160" text-anchor="middle" font-size="22" letter-spacing="8">CONCEPT No. 0${i + 1}</text><text x="${front}" y="${height * 0.43}" text-anchor="middle" font-family="${i === 3 ? "Georgia,serif" : "Arial,sans-serif"}" font-size="${size}" font-weight="${i === 3 ? "400" : "900"}" letter-spacing="${i === 2 ? -9 : 0}">${words[0]}</text><text x="${front}" y="${height * 0.43 + size}" text-anchor="middle" font-size="${size}" font-weight="${i === 3 ? "400" : "900"}">${words[1]}</text><text x="${front}" y="${height * 0.43 + size + 65}" text-anchor="middle" font-size="25" letter-spacing="4">${["CITRUS / SPARKLING", "BERRY / SOFT SPARKLE", "ENERGY / CONCEPT", "COLD BREW / TEA", "PURE / SPARKLING", "GRAPEFRUIT / SODA"][i]}</text><text x="800" y="${height - 120}" text-anchor="middle" font-size="24">${volumeMl} ML · ORIGINAL BEVERAGE STUDY</text><g font-size="20"><text x="90" y="170">${brand}</text><text x="90" y="205">DESIGN EDITION / V${version}</text><text x="90" y="300">DEMO INFORMATION</text><text x="90" y="340">Fictional beverage concept.</text><text x="90" y="375">No legal product claims.</text><text x="90" y="410">Not a factory print template.</text><text x="90" y="470">QAZALPACK / SHOWCASE</text><text x="90" y="510">RGB VISUAL STUDY</text><text x="1250" y="300">EXPERIMENTAL</text><text x="1250" y="340">PACKAGING</text><text x="1250" y="380">COLLECTION / 2026</text></g><text x="800" y="${height - 30}" text-anchor="middle" font-weight="bold" font-size="23">DEMO — NOT FOR PRODUCTION · V${version}${version === 2 ? " / UPDATED TYPE &amp; DETAILS" : ""}</text></g></svg>`;
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent(
        `<style>body{margin:0}svg{display:block}</style>${svg}`,
      );
      const filename = `${slug}-v${version}.png`;
      await page.screenshot({ path: `public/showcase/${filename}` });
      await writeFile(`public/showcase/${slug}-v${version}.svg`, svg);
      await page.pdf({
        path: `public/showcase/${slug}-v${version}.pdf`,
        width: `${Math.PI * diameter}mm`,
        height: `${printHeight}mm`,
        printBackground: true,
        scale: 1,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      // PDF uses the same wrap, sized physically via a raster placed at the target paper size.
      const bytes = await (
        await import("node:fs/promises")
      ).readFile(`public/showcase/${filename}`);
      await page.setContent(
        `<style>@page{size:${Math.PI * diameter}mm ${printHeight}mm;margin:0}body{margin:0}img{width:100%;display:block}</style><img src="data:image/png;base64,${bytes.toString("base64")}">`,
      );
      await page.pdf({
        path: `public/showcase/${slug}-v${version}.pdf`,
        preferCSSPageSize: true,
        printBackground: true,
      });
      await page.close();
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (!bindings.some((b) => b.sha256 === digest))
        bindings.push({ sha256: digest, preset });
      if (version === 1)
        manifest.push({
          id: `showcase-${slug}`,
          slug,
          brand,
          name,
          preset,
          volumeMl,
          filename,
          url: `/showcase/${filename}`,
          mime_type: "image/png",
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          versions: i % 2 === 0 ? 2 : 1,
          width,
          height,
        });
    }
  }
  await writeFile(
    "public/showcase/bindings.json",
    JSON.stringify(bindings, null, 2) + "\n",
  );
  await writeFile(
    "public/showcase/manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
