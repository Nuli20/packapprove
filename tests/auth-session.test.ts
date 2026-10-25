import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: vi.fn(),
  getUser: vi.fn(),
  refresh: vi.fn(),
  profile: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      mocks.jar.has(key) ? { value: mocks.jar.get(key) } : undefined,
    set: mocks.set,
    delete: (key: string) => mocks.jar.delete(key),
  }),
}));
vi.mock("../lib/platform", () => ({
  authClient: () => ({
    auth: { getUser: mocks.getUser, refreshSession: mocks.refresh },
  }),
}));
vi.mock("../lib/db", () => ({ asUser: mocks.profile }));
import { currentUser, saveSession, cookieOptions } from "../lib/auth";
beforeEach(() => {
  mocks.jar.clear();
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.profile.mockResolvedValue({
    id: "verified-user",
    role: "manager",
    full_name: "User",
  });
});
describe("Verified session refresh and cookie boundaries", () => {
  it("keeps valid cookies during an Auth provider outage", async () => {
    mocks.jar.set("pa_access", "access");
    mocks.jar.set("pa_refresh", "refresh-outage");
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 503 },
    });
    await expect(currentUser()).rejects.toMatchObject({ status: 503 });
    expect(mocks.jar.has("pa_access")).toBe(true);
    expect(mocks.jar.has("pa_refresh")).toBe(true);
  });
  it("refreshes when access cookie has already expired and disappeared", async () => {
    mocks.jar.set("pa_refresh", "valid-rotation-1");
    mocks.refresh.mockResolvedValue({
      data: {
        session: {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 1800,
          user: { id: "verified-user", email: "user@example.com" },
        },
      },
      error: null,
    });
    const u = await currentUser();
    expect(u.id).toBe("verified-user");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      "pa_access",
      "new-access",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1800,
      }),
    );
  });
  it("deduplicates concurrent rotation of the same refresh token", async () => {
    mocks.jar.set("pa_refresh", "valid-rotation-concurrent");
    mocks.refresh.mockResolvedValue({
      data: {
        session: {
          access_token: "a",
          refresh_token: "r",
          user: { id: "verified-user" },
        },
      },
      error: null,
    });
    const users = await Promise.all(
      Array.from({ length: 6 }, () => currentUser()),
    );
    expect(users).toHaveLength(6);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("clears invalid cookies and returns actionable 401", async () => {
    mocks.jar.set("pa_refresh", "invalid-rotation-3");
    mocks.refresh.mockResolvedValue({
      data: { session: null },
      error: { message: "expired" },
    });
    await expect(currentUser()).rejects.toMatchObject({ status: 401 });
    expect(mocks.jar.has("pa_refresh")).toBe(false);
  });
  it("never accepts a disabled application profile after a valid Auth session", async () => {
    mocks.jar.set("pa_access", "access");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "verified-user" } },
    });
    mocks.profile.mockResolvedValue(undefined);
    await expect(currentUser()).rejects.toMatchObject({ status: 403 });
  });
  it("uses Secure cookies when explicitly configured", async () => {
    vi.stubEnv("COOKIE_SECURE", "true");
    expect(cookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
    await saveSession({ access_token: "access", refresh_token: "refresh" });
    expect(mocks.set).toHaveBeenCalledWith(
      "pa_refresh",
      "refresh",
      expect.objectContaining({ maxAge: 2592000 }),
    );
    vi.unstubAllEnvs();
  });
});
