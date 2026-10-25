import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  createRecoveryCapability,
  verifyRecoveryCapability,
  changeRecoveredPassword,
} from "../lib/recovery";
import { sha256 } from "../lib/security";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => (jar.has(key) ? { value: jar.get(key) } : undefined),
  }),
}));
const now = Date.UTC(2026, 9, 25, 12, 0, 0);
beforeEach(() => {
  jar.clear();
  vi.stubEnv(
    "AUTH_COOKIE_SECRET",
    "isolated-test-signing-key-with-at-least-32-characters",
  );
});
afterEach(() => vi.unstubAllEnvs());
describe("Server-signed recovery capability", () => {
  it("accepts only the signed capability for the bound verified access token", () => {
    const cap = createRecoveryCapability("verified-token", now);
    expect(verifyRecoveryCapability(cap, "verified-token", now + 1000)).toBe(
      true,
    );
    expect(verifyRecoveryCapability(cap, "different-token", now + 1000)).toBe(
      false,
    );
  });
  it("rejects an expired signed capability even when cookie expiry is ignored", () => {
    const cap = createRecoveryCapability("verified-token", now);
    expect(verifyRecoveryCapability(cap, "verified-token", now + 900000)).toBe(
      false,
    );
  });
  it("rejects the previous forgeable SHA-256 cookie and a fabricated signature", async () => {
    const access = "ordinary-login-access-token";
    expect(verifyRecoveryCapability(sha256(access), access, now)).toBe(false);
    const fabricated = `${Math.floor(now / 1000) + 900}.${sha256(access)}.${"0".repeat(64)}`;
    expect(verifyRecoveryCapability(fabricated, access, now)).toBe(false);
    jar.set("pa_access", access);
    jar.set("pa_refresh", "ordinary-refresh");
    jar.set("pa_recovery", sha256(access));
    await expect(
      changeRecoveredPassword("AttackerChosenPassword2026!"),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects expiry tampering and malformed/truncated signature bytes", () => {
    const cap = createRecoveryCapability("token", now);
    const parts = cap.split(".");
    expect(
      verifyRecoveryCapability(
        `${Number(parts[0]) + 3600}.${parts[1]}.${parts[2]}`,
        "token",
        now,
      ),
    ).toBe(false);
    expect(verifyRecoveryCapability(cap.slice(0, -1), "token", now)).toBe(
      false,
    );
    expect(verifyRecoveryCapability("x.y.z", "token", now)).toBe(false);
    expect(verifyRecoveryCapability(undefined, "token", now)).toBe(false);
  });
  it("supports the existing server service-role secret fallback without a new required variable", () => {
    vi.stubEnv("AUTH_COOKIE_SECRET", "");
    vi.stubEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "existing-server-only-service-secret-with-high-entropy",
    );
    const cap = createRecoveryCapability("token", now);
    expect(verifyRecoveryCapability(cap, "token", now)).toBe(true);
    vi.stubEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "rotated-server-only-service-secret-with-high-entropy",
    );
    expect(verifyRecoveryCapability(cap, "token", now)).toBe(false);
  });
});
