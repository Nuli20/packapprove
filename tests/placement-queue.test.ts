import { it, expect } from "vitest";
import {
  placementDiagnostic,
  canDimensions,
  DEFAULT_CAN_SPEC,
  type CanSpec,
} from "../lib/can-spec";
import { renderQueue } from "../lib/render-queue";
it.each(["standard450", "sleek330", "slim250"] as const)(
  "correct-ratio %s artwork covers the print band without crop or gaps",
  (preset) => {
    const spec: CanSpec = { ...DEFAULT_CAN_SPEC, preset },
      d = canDimensions(spec),
      p = placementDiagnostic(
        2048,
        Math.round((2048 * d.printHeightMm) / d.wrapWidthMm),
        spec,
      );
    expect(p.mismatch).toBe(false);
    expect(p.gaps).toBe(false);
    expect(p.crop).toBe(false);
  },
);
it("contain explains empty bands; cover explains clipping rather than stretching", () => {
  const contain = placementDiagnostic(2048, 512, DEFAULT_CAN_SPEC),
    cover = placementDiagnostic(2048, 512, {
      ...DEFAULT_CAN_SPEC,
      placement: { ...DEFAULT_CAN_SPEC.placement, fit: "cover" },
    });
  expect(contain.mismatch).toBe(true);
  expect(contain.gaps).toBe(true);
  expect(contain.crop).toBe(false);
  expect(cover.gaps).toBe(false);
  expect(cover.crop).toBe(true);
});
it("thumbnail scheduling limits concurrent jobs and cancels unmounted waiters", async () => {
  const queue = renderQueue(2),
    a = await queue(new AbortController().signal),
    b = await queue(new AbortController().signal),
    abort = new AbortController();
  const waiting = queue(abort.signal);
  const rejected = expect(waiting).rejects.toMatchObject({
    name: "AbortError",
  });
  abort.abort();
  await rejected;
  let acquired = false;
  const next = queue(new AbortController().signal).then((done) => {
    acquired = true;
    return done;
  });
  await Promise.resolve();
  expect(acquired).toBe(false);
  a();
  const release = await next;
  expect(acquired).toBe(true);
  release();
  b();
});
