import { cookies } from "next/headers";
import { authClient } from "./platform";
import { AppError } from "./security";
import { asUser } from "./db";
export async function currentUser() {
  const jar = await cookies();
  const token = jar.get("pa_access")?.value;
  if (!token) throw new AppError(401, "Войдите в систему");
  const client = authClient();
  let {
    data: { user },
  } = await client.auth.getUser(token);
  if (!user && jar.get("pa_refresh")?.value) {
    const { data } = await client.auth.refreshSession({
      refresh_token: jar.get("pa_refresh")!.value,
    });
    if (data.session) {
      user = data.user;
      await saveSession(data.session);
    }
  }
  if (!user) throw new AppError(401, "Сессия истекла");
  const profile = await asUser(
    user.id,
    async (tx) =>
      (await tx`select * from profiles where id=${user!.id} and active`)[0],
  );
  if (!profile) throw new AppError(403, "Профиль отключён");
  return { ...profile, email: user.email, id: user.id } as {
    id: string;
    role: string;
    full_name: string;
    email: string;
  };
}
export async function saveSession(s: {
  access_token: string;
  refresh_token: string;
}) {
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    path: "/",
  };
  jar.set("pa_access", s.access_token, { ...opts, maxAge: 3600 });
  jar.set("pa_refresh", s.refresh_token, { ...opts, maxAge: 604800 });
}
