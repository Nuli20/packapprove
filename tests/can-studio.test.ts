import { describe, it, expect } from "vitest";
import {
  CAN_PRESETS,
  boundedImageDimensions,
  canSpecSchema,
  canDimensions,
  imagePlacement,
  visualMime,
} from "../lib/can-spec";
describe("Can geometry / saved visualization contract", () => {
  it.each(Object.entries(CAN_PRESETS))(
    "%s has independent nominal volume and approximate geometry",
    (key, p) => {
      const spec = canSpecSchema.parse({ preset: key });
      const d = canDimensions(spec);
      expect(d.volumeMl).toBe(p.volumeMl);
      expect(d.wrapWidthMm).toBeCloseTo(Math.PI * p.diameterMm);
      expect(d.printHeightMm).toBeLessThan(d.heightMm - 20);
    },
  );
  it("requires explicit experimental mode; never infers nominal ml", () => {
    expect(
      canSpecSchema.safeParse({ preset: "standard450", heightMm: 190 }).success,
    ).toBe(false);
    const exp = canSpecSchema.parse({
      preset: "experimental",
      heightMm: 180,
      diameterMm: 60,
      printHeightMm: 140,
    });
    expect(canDimensions(exp).volumeMl).toBe(null);
    expect(
      canSpecSchema.safeParse({ ...exp, printHeightMm: 179 }).success,
    ).toBe(false);
  });
  it("fits without stretching and applies bounded offset/scale", () => {
    const placement = canSpecSchema.parse({}).placement;
    const fit = imagePlacement(1000, 500, 2048, 1000, placement);
    expect(fit.width / fit.height).toBe(2);
    expect(fit.height).toBeLessThanOrEqual(1000);
    const scaled = imagePlacement(1000, 500, 2048, 1000, {
      ...placement,
      scale: 1.5,
      x: 0.1,
    });
    expect(scaled.width).toBe(fit.width * 1.5);
    expect(scaled.x).not.toBe(fit.x);
    expect(
      canSpecSchema.safeParse({ placement: { ...placement, scale: 99 } })
        .success,
    ).toBe(false);
  });
  it("rejects active content, oversize input and missing format signature", () => {
    expect(() =>
      visualMime(new TextEncoder().encode('<svg onload="alert(1)"/>')),
    ).toThrow();
    expect(() => visualMime(new Uint8Array(26214401))).toThrow();
    expect(visualMime(new Uint8Array([255, 216, 255, 1]))).toBe("image/jpeg");
    expect(visualMime(new TextEncoder().encode("%PDF-1.4"))).toBe(
      "application/pdf",
    );
  });
});

it("rejects JPEG/PNG decompression bombs from headers before bitmap allocation", () => {
  const png = new Uint8Array(24);
  png.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(png.buffer);
  view.setUint32(16, 65535);
  view.setUint32(20, 65535);
  expect(() => boundedImageDimensions(png, "image/png")).toThrow(
    "32 мегапикселя",
  );
  const jpeg = new Uint8Array([
    255, 216, 255, 192, 0, 17, 8, 234, 96, 234, 96, 3, 1, 0, 0, 2, 0, 0, 3, 0,
    0,
  ]);
  expect(() => boundedImageDimensions(jpeg, "image/jpeg")).toThrow(
    "32 мегапикселя",
  );
});
