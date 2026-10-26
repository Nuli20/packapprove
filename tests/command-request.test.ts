import { it, expect, vi, afterEach } from "vitest";
import { commandTransport } from "../lib/command-request";
afterEach(() => vi.unstubAllGlobals());
it("ambiguous retries reuse a key; an intentional new action after success has a new key", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(Error("network disconnected"))
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "saved" }),
    });
  vi.stubGlobal("fetch", fetch);
  const send = commandTransport();
  await expect(
    send("project.create", undefined, { name: "same" }),
  ).rejects.toThrow("network");
  await send("project.create", undefined, { name: "same" });
  await send("project.create", undefined, { name: "same" });
  const key = (i: number) => fetch.mock.calls[i][1].headers["Idempotency-Key"];
  expect(key(0)).toBe(key(1));
  expect(key(2)).not.toBe(key(1));
});
