import { isolatedDemoEnabled, DEMO_ROLES, demoEmail } from "./demo-environment";
import { authClient } from "./platform";
import { asUser } from "./db";
import { assert } from "./security";
import { z } from "zod";
export async function demoSession(payload: unknown) {
  assert(
    isolatedDemoEnabled(),
    "Демонстрационный режим недоступен на этом сервере",
    404,
  );
  const { role } = z.object({ role: z.enum(DEMO_ROLES) }).parse(payload);
  const { data, error } = await authClient().auth.signInWithPassword({
    email: demoEmail(role),
    password: "PackApprove2026!",
  });
  assert(
    !error && data.session,
    "Демонстрационные аккаунты ещё не подготовлены. Обратитесь к администратору демостенда.",
    503,
  );
  const profile = await asUser(
    data.user.id,
    async (tx) =>
      (
        await tx`select id,role from profiles where id=${data.user.id} and active`
      )[0],
  );
  assert(
    profile?.role === role,
    "Роль демо-аккаунта не соответствует настройкам стенда. Доступ не предоставлен.",
    403,
  );
  const view =
    role === "production"
      ? "packages"
      : role === "prepress"
        ? "internal"
        : role === "designer"
          ? "tasks"
          : role === "approver"
            ? "approval"
            : "home";
  return { session: data.session, next: "/?view=" + view };
}
