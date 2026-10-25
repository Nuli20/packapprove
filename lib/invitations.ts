import { db, type Tx } from "./db";
import { sha256, assert, AppError } from "./security";
import { adminClient, authClient } from "./platform";
import { z } from "zod";
export const invitationToken = z.string().regex(/^[a-f0-9]{64}$/);
type Connection = typeof db;
// No actor is authenticated yet. Invoke only narrowly scoped server functions.
async function capability<T>(
  connection: Connection,
  fn: (tx: Tx) => Promise<T>,
) {
  return connection.begin(async (tx) => {
    await tx`set local role packapprove_app`;
    await tx`set local lock_timeout='8s'`;
    await tx`set local idle_in_transaction_session_timeout='30s'`;
    return fn(tx);
  }) as Promise<T>;
}
function invitationError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const code = (e as { code?: string })?.code;
  const known: Record<string, [number, string]> = {
    PA001: [
      404,
      "Приглашение недействительно. Проверьте ссылку или запросите новую у администратора.",
    ],
    PA002: [
      410,
      "Срок приглашения истёк. Попросите администратора выдать новую ссылку.",
    ],
    PA003: [
      409,
      "Это приглашение уже принято. Войдите с вашим email и паролем.",
    ],
    PA004: [
      403,
      "Приглашение отозвано или права пригласившего изменились. Обратитесь к администратору.",
    ],
    PA005: [
      409,
      "Аккаунт уже существует. Войдите или обратитесь к администратору для назначения доступа.",
    ],
    PA006: [
      400,
      "Данные регистрации не соответствуют приглашению. Проверьте имя и запросите помощь администратора.",
    ],
    "55P03": [
      409,
      "Регистрация по этой ссылке уже выполняется. Подождите несколько секунд и повторите.",
    ],
  };
  if (code && known[code]) return new AppError(...known[code]);
  // Never log SQL parameters, tokens, provider messages or passwords.
  console.error("Invitation operation failed", {
    code: code || "provider_unavailable",
  });
  return new AppError(
    503,
    "Сервис приглашений временно недоступен. Администратору необходимо проверить настройку сервера и миграции. Повторите позже.",
  );
}
export async function invitationInfo(
  token: string,
  connection: Connection = db,
) {
  assert(
    invitationToken.safeParse(token).success,
    "Некорректная ссылка приглашения. Запросите новую у администратора.",
    400,
  );
  try {
    return await capability(
      connection,
      async (tx) =>
        (
          await tx`select * from public.invitation_lookup(${sha256(token)},false)`
        )[0],
    );
  } catch (e) {
    throw invitationError(e);
  }
}
export async function acceptInvitation(
  token: string,
  password: string,
  fullName: string,
  connection: Connection = db,
) {
  assert(
    invitationToken.safeParse(token).success,
    "Некорректная ссылка приглашения",
    400,
  );
  assert(
    password.length >= 12 && password.length <= 128,
    "Пароль должен содержать от 12 до 128 символов",
    400,
  );
  assert(
    fullName.trim().length >= 2 && fullName.trim().length <= 100,
    "Укажите имя: от 2 до 100 символов",
    400,
  );
  const hash = sha256(token);
  let created: string | undefined,
    email: string | undefined,
    committed = false;
  try {
    await capability(connection, async (tx) => {
      const [i] =
        await tx`select * from public.invitation_lookup(${hash},true)`;
      email = i.email;
      const { data, error } = await adminClient().auth.admin.createUser({
        email: i.email,
        password,
        email_confirm: true,
      });
      if (error) {
        if (
          [
            "email_exists",
            "email_address_exists",
            "user_already_exists",
          ].includes(error.code || "")
        )
          throw new AppError(
            409,
            "Этот email уже зарегистрирован. Войдите в существующий аккаунт или обратитесь к администратору. Роль и пароль не изменены.",
          );
        if (error.code === "weak_password")
          throw new AppError(
            400,
            "Пароль слишком простой. Используйте более длинный пароль с разными символами.",
          );
        throw new AppError(
          503,
          "Supabase Auth временно не может создать аккаунт. Приглашение не использовано; повторите позже.",
        );
      }
      assert(data.user, "Сервис регистрации временно недоступен", 503);
      created = data.user.id;
      await tx`select public.invitation_finish(${hash},${created}::uuid,${fullName.trim()})`;
    });
    committed = true;
  } catch (e) {
    if (created) {
      const createdId = created;
      try {
        const state = await capability(
          connection,
          async (tx) =>
            (
              await tx`select public.invitation_registration_state(${hash},${createdId}::uuid) as state`
            )[0].state,
        );
        if (state === "accepted") committed = true;
        else if (state === "pending") {
          const { error } = await adminClient().auth.admin.deleteUser(created);
          if (error)
            console.error("Invitation Auth cleanup requires administrator", {
              userId: created,
            });
        } else
          console.error("Invitation registration requires administrator", {
            userId: created,
          });
      } catch {
        console.error(
          "Invitation commit outcome unknown; Auth user preserved",
          { userId: created },
        );
      }
    }
    if (!committed) throw invitationError(e);
  }
  // Sign-in failure must never delete a committed profile or reset a used token.
  const { data, error } = await authClient().auth.signInWithPassword({
    email: email!,
    password,
  });
  assert(
    !error && data.session,
    "Аккаунт создан. Откройте страницу входа и войдите с новым паролем.",
    401,
  );
  return data.session;
}
