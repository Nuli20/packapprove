import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { cookieOptions, saveSession } from "./auth";
import { assert, sha256 } from "./security";
const CAPABILITY_SECONDS = 900;
function recoverySigningKey() {
  const key =
    process.env.AUTH_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(
    key && key.length >= 32,
    "Сервис восстановления не настроен. Обратитесь к администратору.",
    503,
  );
  return key;
}
function capabilitySignature(expires: string, accessHash: string) {
  return createHmac("sha256", recoverySigningKey())
    .update(`packapprove:password-recovery:v1.${expires}.${accessHash}`)
    .digest();
}
export function createRecoveryCapability(access: string, now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + CAPABILITY_SECONDS),
    hash = sha256(access);
  return `${expires}.${hash}.${capabilitySignature(expires, hash).toString("hex")}`;
}
export function verifyRecoveryCapability(
  capability: string | undefined,
  access: string,
  now = Date.now(),
) {
  if (!capability || capability.length > 256) return false;
  const parts = capability.split(".");
  if (parts.length !== 3) return false;
  const [expires, hash, signature] = parts;
  if (
    !/^\d{10,11}$/.test(expires) ||
    !Number.isSafeInteger(Number(expires)) ||
    Number(expires) <= Math.floor(now / 1000) ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = capabilitySignature(expires, hash);
  return (
    timingSafeEqual(Buffer.from(signature, "hex"), expected) &&
    timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(sha256(access), "hex"),
    )
  );
}
export async function recoveryClient() {
  const jar = await cookies();
  const memory = new Map<string, string>();
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem(key) {
            return key.endsWith("-code-verifier")
              ? jar.get("pa_pkce_" + sha256(key).slice(0, 20))?.value || null
              : memory.get(key) || null;
          },
          setItem(key, value) {
            if (key.endsWith("-code-verifier"))
              jar.set("pa_pkce_" + sha256(key).slice(0, 20), value, {
                ...cookieOptions(),
                maxAge: 900,
              });
            else memory.set(key, value);
          },
          removeItem(key) {
            if (key.endsWith("-code-verifier"))
              jar.delete("pa_pkce_" + sha256(key).slice(0, 20));
            else memory.delete(key);
          },
        },
      },
    },
  );
}
export async function acceptRecovery(params: URLSearchParams) {
  const client = await recoveryClient();
  let session;
  if (params.get("code")) {
    const { data, error } = await client.auth.exchangeCodeForSession(
      params.get("code")!,
      params.has("sb_flow_id")
        ? { flowId: params.get("sb_flow_id")! }
        : undefined,
    );
    assert(
      !error &&
        data.session &&
        (data as typeof data & { redirectType?: string }).redirectType ===
          "recovery",
      "Ссылка недействительна или открыта в другом браузере. Запросите восстановление заново.",
      400,
    );
    session = data.session;
  } else {
    const token = params.get("token_hash");
    assert(
      token && token.length >= 20 && token.length <= 256,
      "Отсутствует код восстановления",
      400,
    );
    const { data, error } = await client.auth.verifyOtp({
      token_hash: token,
      type: "recovery",
    });
    assert(
      !error && data.session,
      "Ссылка истекла или уже использована. Запросите восстановление заново.",
      400,
    );
    session = data.session;
  }
  await saveSession(session);
  const jar = await cookies();
  jar.set("pa_recovery", createRecoveryCapability(session.access_token), {
    ...cookieOptions(),
    maxAge: 900,
  });
}
export async function changeRecoveredPassword(password: string) {
  const jar = await cookies(),
    access = jar.get("pa_access")?.value,
    refresh = jar.get("pa_refresh")?.value;
  assert(
    access &&
      refresh &&
      verifyRecoveryCapability(jar.get("pa_recovery")?.value, access),
    "Для смены пароля откройте действующую ссылку из письма.",
    401,
  );
  const client = await recoveryClient();
  const { data, error } = await client.auth.setSession({
    access_token: access,
    refresh_token: refresh,
  });
  assert(
    !error && data.session,
    "Сессия восстановления истекла. Запросите новую ссылку.",
    401,
  );
  const updated = await client.auth.updateUser({ password });
  assert(
    !updated.error,
    "Не удалось изменить пароль. Проверьте требования к паролю или запросите новую ссылку.",
    400,
  );
  jar.delete("pa_recovery");
  for (const cookie of jar.getAll())
    if (cookie.name.startsWith("pa_pkce_")) jar.delete(cookie.name);
  // Password recovery never alters profiles, memberships, or application roles.
  const current = await client.auth.getSession();
  if (current.data.session) await saveSession(current.data.session);
}
