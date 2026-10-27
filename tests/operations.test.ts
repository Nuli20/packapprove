import { describe, expect, it } from "vitest";
import { operationalItems, nextBlock } from "../lib/workflow";
import type { State } from "../components/workspace";
function snapshot(overrides: Record<string, any> = {}): State {
  return {
    user: { id: "designer", role: "designer" },
    projects: [
      {
        id: "p",
        designer_id: "designer",
        prepress_id: "prepress",
        manager_id: "manager",
      },
    ],
    artworks: [
      {
        id: "a",
        project_id: "p",
        active_version_id: "v2",
        deadline: "2026-12-20",
      },
    ],
    versions: [{ id: "v2", artwork_id: "a", status: "approved" }],
    rounds: [
      {
        id: "r2",
        version_id: "v2",
        status: "approved",
        deadline: "2026-12-19",
      },
    ],
    reviews: [{ id: "t2", version_id: "v2", status: "ready" }],
    packages: [],
    threads: [],
    participants: [],
    decisions: [],
    ...overrides,
  } as unknown as State;
}
describe("Operational queue selectors", () => {
  it("only an active version with both approval and ready review can be issued", () => {
    const [item] = operationalItems(snapshot());
    expect(item.ready).toBe(true);
    expect(item.stage).toBe("ready");
    expect(nextBlock(item)).toBe("ready");
  });
  it.each(["limited", "correction"])(
    "technical result %s blocks production despite client approval",
    (status) => {
      const [item] = operationalItems(
        snapshot({ reviews: [{ version_id: "v2", status }] }),
      );
      expect(item.ready).toBe(false);
      expect(item.correction).toBe(true);
      expect(nextBlock(item)).toBe("needCorrections");
    },
  );
  it("approval of an older version cannot qualify the active version", () => {
    const [item] = operationalItems(
      snapshot({
        rounds: [{ id: "r1", version_id: "v1", status: "approved" }],
      }),
    );
    expect(item.ready).toBe(false);
    expect(nextBlock(item)).toBe("needApproval");
  });
  it("an existing package prevents a duplicate production entry", () => {
    const [item] = operationalItems(
      snapshot({ packages: [{ version_id: "v2", status: "revoked" }] }),
    );
    expect(item.ready).toBe(false);
    expect(item.stage).toBe("production");
    expect(nextBlock(item)).toBe("packageRevoked");
  });
  it("internal review belongs to the assigned prepress employee, not designer", () => {
    const [item] = operationalItems(
      snapshot({
        versions: [{ id: "v2", status: "internal_review" }],
        rounds: [],
        reviews: [],
      }),
    );
    expect(item.stage).toBe("internal");
    expect(item.responsible).toBe("prepress");
    expect(item.mine).toBe(false);
  });
  it("only an undecided assigned approver has a client action", () => {
    const data = snapshot({
      user: { id: "c", role: "approver" },
      rounds: [
        { id: "r2", version_id: "v2", status: "open", deadline: "2026-12-18" },
      ],
      participants: [{ round_id: "r2", user_id: "c", kind: "approver" }],
    });
    expect(operationalItems(data)[0].mine).toBe(true);
    expect(operationalItems(data)[0].deadline).toBe("2026-12-18");
    expect(
      operationalItems({
        ...data,
        decisions: [
          {
            id: "decision",
            row_version: 1,
            version_id: "v2",
            comment: "",
            sha256: "a".repeat(64),
            round_id: "r2",
            user_id: "c",
            result: "approved",
          },
        ],
      })[0].mine,
    ).toBe(false);
  });
  it("no uploaded version produces an explicit upload requirement", () => {
    const [item] = operationalItems(
      snapshot({ versions: [], rounds: [], reviews: [] }),
    );
    expect(nextBlock(item)).toBe("needUpload");
    expect(item.stage).toBe("design");
  });
  it("an ordinary open discussion does not require changes to an approved version", () => {
    const [item] = operationalItems(
      snapshot({ threads: [{ version_id: "v2", status: "open" }] }),
    );
    expect(item.correction).toBe(false);
    expect(item.ready).toBe(true);
  });
  it("a completed technical check gives the assigned manager a dispatch action", () => {
    const [item] = operationalItems(
      snapshot({
        user: { id: "manager", role: "manager" },
        versions: [{ id: "v2", status: "internal_review" }],
        rounds: [],
      }),
    );
    expect(item.stage).toBe("dispatch");
    expect(item.mine).toBe(true);
    expect(nextBlock(item)).toBe("needSend");
  });
  it("waiting for a client is not a manager action or designer approval permission", () => {
    for (const role of ["manager", "designer", "admin"]) {
      const [item] = operationalItems(
        snapshot({
          user: { id: role, role },
          rounds: [{ id: "r2", version_id: "v2", status: "open" }],
        }),
      );
      expect(item.mine).toBe(false);
    }
  });
});
