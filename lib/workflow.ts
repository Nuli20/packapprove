import type { WorkspaceState as State } from "./models";
export function operationalItems(d: State) {
  return d.artworks.map((a) => {
    const project = d.projects.find((p) => p.id === a.project_id);
    const version = d.versions.find((v) => v.id === a.active_version_id);
    const review = d.reviews.find((r) => r.version_id === version?.id);
    const round = d.rounds.find((r) => r.version_id === version?.id);
    const pkg = d.packages.find((p) => p.version_id === version?.id);
    const threads = d.threads.filter(
      (t) => t.version_id === version?.id && t.status === "open",
    );
    const ready =
      !!version &&
      version.status === "approved" &&
      round?.status === "approved" &&
      review?.status === "ready" &&
      !pkg;
    const correction =
      version?.status === "changes_requested" ||
      ["correction", "limited"].includes(review?.status);
    const client = ["observer", "approver"].includes(d.user.role);
    const stage = pkg
      ? "production"
      : client && version?.status === "approved" && round?.status === "approved"
        ? "approved"
        : ready
          ? "ready"
          : correction
            ? "changes"
            : round?.status === "open"
              ? "approval"
              : version?.status === "internal_review" ||
                  (version?.status === "approved" && review?.status !== "ready")
                ? review?.status === "ready"
                  ? "dispatch"
                  : "internal"
                : "design";
    const responsible =
      stage === "internal"
        ? project?.prepress_id
        : stage === "design" || stage === "changes"
          ? project?.designer_id
          : ["ready", "dispatch"].includes(stage)
            ? project?.manager_id
            : undefined;
    const deadline = round?.status === "open" ? round.deadline : a.deadline;
    const mine =
      !!project &&
      !pkg &&
      (!project.status || project.status === "active") &&
      d.user.role !== "observer" &&
      (["approver", "observer"].includes(d.user.role)
        ? round?.status === "open" &&
          d.participants.some(
            (p) =>
              p.round_id === round.id &&
              p.user_id === d.user.id &&
              p.kind === "approver",
          ) &&
          !d.decisions.some(
            (x) => x.round_id === round.id && x.user_id === d.user.id,
          )
        : responsible === d.user.id &&
          ((["design", "changes"].includes(stage) &&
            d.user.role === "designer") ||
            (stage === "internal" && d.user.role === "prepress") ||
            (["ready", "dispatch"].includes(stage) &&
              d.user.role === "manager")));
    return {
      a,
      client,
      project,
      version,
      review,
      round,
      pkg,
      threads,
      ready,
      correction,
      stage,
      responsible,
      deadline,
      mine,
    };
  });
}
export function nextBlock(item: ReturnType<typeof operationalItems>[number]) {
  if (!item.version) return "needUpload";
  if (item.pkg)
    return ["revoked", "replaced"].includes(item.pkg.status)
      ? "packageRevoked"
      : "packageExists";
  if (
    item.client &&
    item.version.status === "approved" &&
    item.round?.status === "approved"
  )
    return "clientDone";
  if (item.version.status === "fixed") return "needInternalSubmit";
  if (item.correction) return "needCorrections";
  if (item.stage === "dispatch") return "needSend";
  if (item.stage === "internal") return "needTechnical";
  if (item.round?.status !== "approved") return "needApproval";
  if (item.review?.status !== "ready") return "needTechnical";
  return "ready";
}
