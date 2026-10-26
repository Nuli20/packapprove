/** Serializable workspace contracts; file bytes and storage paths never belong here. */
export type Role = "admin" | "manager" | "designer" | "prepress" | "observer" | "approver" | "production";
export interface Entity { id: string; created_at?: string; updated_at?: string; row_version: number }
export interface Profile extends Entity { full_name: string; role: Role; active: boolean }
export interface Project extends Entity { name: string; organization_id: string; organization_name: string; manager_id: string; designer_id: string; prepress_id: string; deadline: string; status: "active"|"paused"|"completed"|"archived"; priority: string; description: string; contacts: string; customer_order: string; artwork_count?:number }
export interface Artwork extends Entity { project_id: string; name: string; active_version_id: string; status: string; deadline: string; packaging_type: string }
export interface ArtworkVersion extends Entity { artwork_id: string; number: number; author_id: string; previous_version_id?: string; changes: string; status: "fixed"|"internal_review"|"published"|"approved"|"changes_requested"|"superseded" }
export interface VersionFile extends Entity { version_id: string; kind: "source"|"preview"|"production"; filename: string; mime_type: string; size: number; sha256: string }
export interface ApprovalRound extends Entity { version_id: string; artwork_id: string; opened_by: string; deadline: string; policy: "all"; status: "open"|"approved"|"changes_requested"|"superseded"|"cancelled"; closed_at?: string }
export interface Decision extends Entity { round_id: string; version_id: string; user_id: string; result: "approved"|"changes_requested"; comment: string; sha256: string }
export interface Package extends Entity { project_id: string; artwork_id: string; version_id: string; number: string; file_id: string; sha256: string; issued_by: string; status: "prepared"|"transferred"|"received"|"revoked"|"replaced" }
// Forms/JSON brief and the less central legacy projections are gradually narrowed.
export type Row = Record<string, any>;
export interface WorkspaceState {
 user: Profile; projects: Project[]; artworks: Artwork[]; versions: ArtworkVersion[]; files: VersionFile[];
 profiles: Profile[]; rounds: ApprovalRound[]; decisions: Decision[]; packages: Package[];
 organizations: Row[]; memberships: Row[]; briefs: Row[]; visualizations: Row[]; threads: Row[]; comments: Row[];
 participants: Row[]; templates: Row[]; reviews: Row[]; reviewItems: Row[]; notifications: Row[]; audit: Row[];
 resolutions: Row[]; downloads: Row[]; revocations: Row[]; acknowledgements: Row[]; invitations: Row[]; demo_context?: Row[];
 metrics?: Record<string, number>; setup_complete?: boolean;
 pagination?: { page: number; pageSize: number; total: number; pages: number };
 report?: { hours: number; rounds: number; versions: number; replaced: number; cancelled: number; workload: Row[]; overdue: Row[] };
}
export const stateTables = ["projects","artworks","versions","files","profiles","rounds","decisions","packages","organizations","memberships","briefs","visualizations","threads","comments","participants","templates","reviews","reviewItems","notifications","audit","resolutions","downloads","revocations","acknowledgements","invitations"] as const;
