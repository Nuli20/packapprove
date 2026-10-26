import { permit } from "../security";
import type { Command, User } from "../service";
const staff = ["admin", "manager", "designer", "prepress"];
const discussion = [...staff, "observer", "approver"];
/** Evaluated before returning an idempotent response, using the fresh server profile. */
const commandRoles: Record<Command["action"], string[]> = {
  "company.initialize": ["admin"],
  "organization.create": ["admin", "manager"],
  "profile.update": ["admin"],
  "invitation.create": ["admin", "manager"],
  "invitation.resend": ["admin", "manager"],
  "template.create": ["admin"],
  "project.create": ["admin", "manager"],
  "project.update": ["admin", "manager"],
  "artwork.create": ["admin", "manager"],
  "brief.save": ["admin", "manager"],
  "version.create": ["designer"],
  "version.submit": ["designer"],
  "review.complete": ["prepress"],
  "round.open": ["admin", "manager"],
  "decision.create": ["approver"],
  "comment.create": discussion,
  "comment.reply": discussion,
  "comment.resolve": ["admin", "manager", "designer"],
  "comment.carry": ["admin", "manager", "designer"],
  "package.issue": ["admin", "manager"],
  "package.ack": ["production"],
  "package.revoke": ["admin", "manager"],
  "notification.read": [...discussion, "production"],
};
export function authorizeCommand(user: User, command: Command) {
  permit(user.role, commandRoles[command.action]);
  if (
    command.action === "invitation.create" &&
    !["observer", "approver"].includes(String(command.payload.role))
  )
    permit(user.role, ["admin"]);
}
