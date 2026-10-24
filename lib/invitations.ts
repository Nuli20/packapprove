import { db } from "./db";
import { sha256, assert } from "./security";
import { adminClient, authClient } from "./platform";
export async function invitationInfo(token: string) {
  const [r] =
    await db`select i.email,i.role,o.name as organization from invitations i join organizations o on o.id=i.organization_id where i.token_hash=${sha256(token)} and i.accepted_at is null and i.expires_at>now()`;
  assert(r, "Приглашение недействительно или истекло", 404);
  return r;
}
export async function acceptInvitation(
  token: string,
  password: string,
  fullName: string,
) {
  let created: string | undefined;
  try {
    const email = await db.begin(async (tx) => {
      const [i] =
        await tx`select * from invitations where token_hash=${sha256(token)} for update`;
      assert(
        i && !i.accepted_at && new Date(i.expires_at) > new Date(),
        "Приглашение недействительно или уже принято",
        409,
      );
      const { data, error } = await adminClient().auth.admin.createUser({
        email: i.email,
        password,
        email_confirm: true,
      });
      assert(
        !error && data.user,
        "Не удалось создать аккаунт. Если email уже зарегистрирован, обратитесь к администратору.",
        409,
      );
      created = data.user.id;
      await tx`insert into profiles(id,full_name,role) values(${created},${fullName},${i.role})`;
      await tx`insert into organization_memberships(organization_id,user_id) values(${i.organization_id},${created})`;
      await tx`update invitations set accepted_at=now() where id=${i.id}`;
      await tx`insert into audit_logs(actor_id,action,entity_id) values(${created},'invitation.accept',${i.id})`;
      return i.email;
    });
    created = undefined;
    const { data, error } = await authClient().auth.signInWithPassword({
      email: email as string,
      password,
    });
    assert(
      !error && data.session,
      "Аккаунт создан. Войдите с новым паролем.",
      401,
    );
    return data.session;
  } catch (e) {
    if (created) await adminClient().auth.admin.deleteUser(created);
    throw e;
  }
}
