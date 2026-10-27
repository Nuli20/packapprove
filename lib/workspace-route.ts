export function readWorkspaceRoute(search: string) {
  const q = new URLSearchParams(search);
  return {
    view: q.has("artwork")
      ? "artwork"
      : q.has("project")
        ? "project"
        : q.get("view") || "home",
    project: q.get("project") || "",
    artwork: q.get("artwork") || "",
    version: q.get("version") || "",
    compare: q.get("compare") || "",
    mode: q.get("mode") || "auto",
    search: q.get("q") || "",
    page: Number(q.get("page") || 1),
  };
}
export function workspaceRequest(
  view: string,
  project: string,
  artwork: string,
  version: string,
  compare: string,
  page: number,
  search: string,
) {
  const q = new URLSearchParams({ view, page: String(page) });
  if (project && view === "project") q.set("project", project);
  if (artwork && view === "artwork") q.set("artwork", artwork);
  if (version && view === "artwork") q.set("version", version);
  if (compare && view === "artwork") q.set("compare", compare);
  if (
    search &&
    [
      "projects",
      "tasks",
      "internal",
      "approval",
      "changes",
      "ready",
      "allArtworks",
      "approvedVersions",
    ].includes(view)
  )
    q.set("q", search);
  return "/api/state?" + q;
}
