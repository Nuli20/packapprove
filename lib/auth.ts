import { cookies } from "next/headers";
import { authClient } from "./platform";
import { AppError, sha256 } from "./security";
import { asUser } from "./db";
import type { Session, User } from "@supabase/supabase-js";

export function cookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.COOKIE_SECURE === "true" ||
      (process.env.COOKIE_SECURE !== "false" &&
        process.env.NODE_ENV === "production"),
    sameSite: "lax" as const,
    path: "/",
  };
}
function rejectProviderOutage(
  error: { status?: number; name?: string } | null | undefined,
) {
  if (
    error &&
    (Number(error.status) >= 500 ||
      error.status === 429 ||
      error.name === "AuthRetryableFetchError")
  )
    throw new AppError(
      503,
      "Сервис авторизации временно недоступен. Повторите запрос; сессия сохранена.",
    );
}
// Concurrent browser requests must reuse one token rotation, rather than race it.
const rotations = new Map<
  string,
  { until: number; promise: Promise<Session | null> }
>();
async function rotate(refresh: string): Promise<Session | null> {
  const key = sha256(refresh),
    now = Date.now();
  for (const [key, entry] of rotations)
    if (entry.until < now) rotations.delete(key);
  const existing = rotations.get(key);
  if (existing) return existing.promise;
  const promise = authClient()
    .auth.refreshSession({ refresh_token: refresh })
    .then(({ data, error }) => {
      rejectProviderOutage(error);
      return error ? null : data.session;
    });
  rotations.set(key, { until: now + 10000, promise });
  return promise;
}
export async function currentUser() {
  const jar = await cookies();
  const token = jar.get("pa_access")?.value;
  const refresh = jar.get("pa_refresh")?.value;
  let user: User | null = null;
  if (token) {
    const { data, error } = await authClient().auth.getUser(token);
    rejectProviderOutage(error);
    user = data.user;
  }
  // The access cookie can expire before a request; the refresh cookie is sufficient.
  if (!user && refresh) {
    const session = await rotate(refresh);
    if (session) {
      user = session.user;
      await saveSession(session);
    }
  }
  if (!user) {
    jar.delete("pa_access");
    jar.delete("pa_refresh");
    throw new AppError(
      401,
      "Сессия завершена. Войдите снова — сохранённые данные не потеряны.",
    );
  }
  const profile = await asUser(
    user.id,
    async (tx) =>
      (await tx`select * from profiles where id=${user!.id} and active`)[0],
  );
  if (!profile)
    throw new AppError(403, "Профиль отключён. Обратитесь к администратору.");
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
  expires_in?: number;
}) {
  const jar = await cookies(),
    opts = cookieOptions();
  jar.set("pa_access", s.access_token, {
    ...opts,
    maxAge: Math.max(1, s.expires_in || 3600),
  });
  jar.set("pa_refresh", s.refresh_token, {
    ...opts,
    maxAge: 60 * 60 * 24 * 30,
  });
}
