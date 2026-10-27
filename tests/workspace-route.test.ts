import { it, expect } from "vitest";
import { readWorkspaceRoute, workspaceRequest } from "../lib/workspace-route";
it("restores selected and compared versions from a direct URL", () => {
  const q = readWorkspaceRoute(
    "?artwork=11111111-1111-4111-8111-111111111111&version=22222222-2222-4222-8222-222222222222&mode=compare&compare=33333333-3333-4333-8333-333333333333",
  );
  expect(q.view).toBe("artwork");
  expect(q.mode).toBe("compare");
  expect(q.compare).toBe("33333333-3333-4333-8333-333333333333");
  const request = new URL(
    workspaceRequest(
      q.view,
      q.project,
      q.artwork,
      q.version,
      q.compare,
      q.page,
      q.search,
    ),
    "http://localhost",
  );
  expect(request.searchParams.get("compare")).toBe(q.compare);
  expect(request.searchParams.get("version")).toBe(q.version);
});
it("preserves legacy project links without adding artwork parameters", () => {
  const q = readWorkspaceRoute("?project=11111111-1111-4111-8111-111111111111");
  expect(q.view).toBe("project");
  expect(q.compare).toBe("");
  expect(
    workspaceRequest(
      q.view,
      q.project,
      q.artwork,
      q.version,
      q.compare,
      q.page,
      q.search,
    ),
  ).not.toContain("artwork=");
});
