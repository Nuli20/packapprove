import { z } from "zod";
// Visual study presets only. Nominal volumes are labels, never calculated from geometry.
export const CAN_PRESETS = {
  standard450: {
    name: "Standard",
    volumeMl: 450,
    heightMm: 168,
    diameterMm: 66,
    printHeightMm: 136,
  },
  sleek330: {
    name: "Sleek",
    volumeMl: 330,
    heightMm: 145,
    diameterMm: 58,
    printHeightMm: 113,
  },
  slim250: {
    name: "Slim",
    volumeMl: 250,
    heightMm: 134,
    diameterMm: 53,
    printHeightMm: 102,
  },
} as const;
export type CanPreset = keyof typeof CAN_PRESETS;
export const canSpecSchema = z
  .object({
    pdfPage: z.number().int().min(1).max(10000).default(1),
    preset: z
      .enum(["standard450", "sleek330", "slim250", "experimental"])
      .default("standard450"),
    heightMm: z.number().min(90).max(220).optional(),
    diameterMm: z.number().min(40).max(90).optional(),
    printHeightMm: z.number().min(50).max(195).optional(),
    placement: z
      .object({
        x: z.number().min(-1).max(1),
        y: z.number().min(-1).max(1),
        scale: z.number().min(0.25).max(3),
        seam: z.number().min(-180).max(180),
        fit: z.enum(["contain", "cover"]),
      })
      .default({ x: 0, y: 0, scale: 1, seam: 0, fit: "contain" }),
  })
  .superRefine((s, c) => {
    if (
      s.preset === "experimental" &&
      (!s.heightMm ||
        !s.diameterMm ||
        !s.printHeightMm ||
        s.printHeightMm > s.heightMm - 32)
    )
      c.addIssue({
        code: "custom",
        message:
          "Укажите экспериментальные размеры и оставьте минимум 32 мм вне печати.",
      });
    if (
      s.preset !== "experimental" &&
      (s.heightMm !== undefined ||
        s.diameterMm !== undefined ||
        s.printHeightMm !== undefined)
    )
      c.addIssue({
        code: "custom",
        message:
          "Размеры номинального формата нельзя переопределять. Используйте экспериментальный режим.",
      });
  });
export type CanSpec = z.infer<typeof canSpecSchema>;
export const DEFAULT_CAN_SPEC: CanSpec = canSpecSchema.parse({});
export function canDimensions(spec: CanSpec) {
  if (spec.preset === "experimental")
    return {
      name: "Experimental",
      volumeMl: null,
      heightMm: spec.heightMm!,
      diameterMm: spec.diameterMm!,
      printHeightMm: spec.printHeightMm!,
      wrapWidthMm: Math.PI * spec.diameterMm!,
    };
  const p = CAN_PRESETS[spec.preset];
  return { ...p, wrapWidthMm: Math.PI * p.diameterMm };
}
export function imagePlacement(
  sw: number,
  sh: number,
  cw: number,
  ch: number,
  p: CanSpec["placement"],
) {
  const factor =
    (p.fit === "cover"
      ? Math.max(cw / sw, ch / sh)
      : Math.min(cw / sw, ch / sh)) * p.scale;
  const w = sw * factor,
    h = sh * factor;
  return {
    x: (cw - w) / 2 + p.x * cw,
    y: (ch - h) / 2 + p.y * ch,
    width: w,
    height: h,
  };
}
export function visualMime(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024)
    throw Error("Файл должен быть не больше 25 МБ.");
  if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-")
    return "application/pdf";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  throw Error(
    "Допускаются настоящие PNG, JPEG или PDF. SVG и исполняемые файлы запрещены.",
  );
}
// Inspect image headers before decoding to avoid allocating decompression bombs.
export function boundedImageDimensions(bytes: Uint8Array, mime: string) {
  let width = 0,
    height = 0;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    if (
      bytes.length < 24 ||
      new TextDecoder().decode(bytes.subarray(12, 16)) !== "IHDR"
    )
      throw Error("Некорректный PNG.");
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else if (mime === "image/jpeg") {
    let i = 2;
    while (i + 3 < bytes.length) {
      if (bytes[i++] !== 255) continue;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0xd8 || marker === 1 || (marker >= 0xd0 && marker <= 0xd7))
        continue;
      if (i + 2 > bytes.length) break;
      const length = v.getUint16(i);
      if (length < 2 || i + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (length < 7) break;
        height = v.getUint16(i + 3);
        width = v.getUint16(i + 5);
        break;
      }
      i += length;
    }
    if (!width || !height) throw Error("Некорректный JPEG.");
  } else throw Error("Неизвестный формат изображения.");
  if (!width || !height || width * height > 32000000)
    throw Error(
      "Изображение превышает 32 мегапикселя или имеет неверные размеры.",
    );
  return { width, height };
}

export function placementDiagnostic(
  width: number,
  height: number,
  spec: CanSpec,
) {
  const d = canDimensions(spec),
    ratio = d.wrapWidthMm / d.printHeightMm,
    w = 2048,
    h = Math.round(w / ratio),
    rect = imagePlacement(width, height, w, h, spec.placement);
  return {
    ratio,
    w,
    h,
    sourceRatio: width / height,
    mismatch: Math.abs(width / height / ratio - 1) > 0.01,
    gaps:
      rect.x > 1 ||
      rect.y > 1 ||
      rect.x + rect.width < w - 1 ||
      rect.y + rect.height < h - 1,
    crop:
      rect.x < -1 ||
      rect.y < -1 ||
      rect.x + rect.width > w + 1 ||
      rect.y + rect.height > h + 1,
  };
}
