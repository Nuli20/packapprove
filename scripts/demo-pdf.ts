export function demoPdf(title = "GREEN TEA", version = 1): Buffer {
  const palettes = [
    [0.18, 0.36, 0.28],
    [0.46, 0.28, 0.29],
    [0.35, 0.29, 0.47],
  ];
  const color = palettes[(version - 1) % 3];
  const stream = `q\n0.98 0.97 0.94 rg 0 0 500 650 re f\n${color.join(" ")} rg 40 55 420 540 re f\n0.94 0.92 0.83 rg 55 120 390 420 re f\n${color.join(" ")} rg\nBT /F1 10 Tf 1 0 0 1 178 565 Tm (Q A Z A L P A C K) Tj ET\nBT /F1 12 Tf 1 0 0 1 185 490 Tm (BOTANICAL SERIES) Tj ET\nBT /F1 36 Tf 1 0 0 1 95 400 Tm (${title.replace(/[^A-Z0-9 ]/g, "").slice(0, 16)}) Tj ET\nBT /F1 12 Tf 1 0 0 1 172 365 Tm (NATURALLY GOOD.) Tj ET\n0.32 0.48 0.35 rg 215 210 70 95 re f\n0.72 0.78 0.62 rg 175 240 55 90 re f\n0.5 0.63 0.43 rg 280 225 40 80 re f\n${color.join(" ")} rg\nBT /F1 9 Tf 1 0 0 1 175 165 Tm (PREMIUM LOOSE LEAF TEA) Tj ET\nBT /F1 11 Tf 1 0 0 1 225 140 Tm (100 g) Tj ET\n0.93 0.92 0.85 rg\nBT /F1 8 Tf 1 0 0 1 73 82 Tm (PACKAPPROVE / VERSION ${version} / PRINT ARTWORK) Tj ET\nQ`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 650] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(out);
}
