import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { currentUser, saveSession } from "@/lib/auth";
import { authClient } from "@/lib/platform";
import { prepareUpload } from "@/lib/uploads";
import { snapshot, download } from "@/lib/queries";
import { execute, commandSchema } from "@/lib/service";
import { invitationInfo, acceptInvitation } from "@/lib/invitations";
import {
  recoveryClient,
  acceptRecovery,
  changeRecoveredPassword,
} from "@/lib/recovery";
import { AppError, assert } from "@/lib/security";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const attempts = new Map<string, { n: number; at: number }>();
async function bodyJson(req: NextRequest, limit = 8192): Promise<unknown> {
  assert(
    Number(req.headers.get("content-length") || 0) <= limit,
    "Запрос слишком большой",
    413,
  );
  const reader = req.body?.getReader();
  assert(reader, "Пустой запрос", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AppError(413, "Запрос слишком большой");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Некорректный JSON");
  }
}
async function route(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const name = path.join("/");
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      assert(
        !origin ||
          (process.env.APP_ORIGIN
            ? new URL(origin).origin === new URL(process.env.APP_ORIGIN).origin
            : new URL(origin).host === req.headers.get("host")),
        "Недопустимый Origin",
        403,
      );
    }
    if (name === "health")
      return NextResponse.json({ status: "ok", service: "PackApprove" });
    if (
      ["auth/login", "auth/recover", "auth/password"].includes(name) &&
      req.method === "POST"
    ) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "local";
      const now = Date.now();
      const a = attempts.get(ip);
      if (a && now - a.at < 60000) {
        assert(a.n < 30, "Повторите вход через минуту", 429);
        a.n++;
      } else attempts.set(ip, { n: 1, at: now });
      if (name === "auth/recover") {
        const { email } = z
          .object({ email: z.email() })
          .parse(await bodyJson(req));
        const appOrigin = process.env.APP_ORIGIN
          ? new URL(process.env.APP_ORIGIN).origin
          : req.nextUrl.origin;
        const client = await recoveryClient();
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: appOrigin + "/api/auth/callback",
        });
        assert(
          !error,
          "Сервис восстановления временно недоступен. Обратитесь к администратору.",
          503,
        );
        return NextResponse.json({
          ok: true,
          message:
            "Если аккаунт существует, Supabase отправит письмо с инструкциями. Проверьте почту и папку «Спам».",
        });
      }
      if (name === "auth/password") {
        const { password } = z
          .object({ password: z.string().min(12).max(128) })
          .parse(await bodyJson(req));
        await changeRecoveredPassword(password);
        return NextResponse.json({ ok: true });
      }
      const input = z
        .object({ email: z.email(), password: z.string().min(8).max(128) })
        .parse(await bodyJson(req));
      const { data, error } = await authClient().auth.signInWithPassword(input);
      assert(!error && data.session, "Неверный email или пароль", 401);
      await saveSession(data.session);
      return NextResponse.json({ ok: true });
    }
    if (name === "auth/callback" && req.method === "GET") {
      const origin = process.env.APP_ORIGIN
        ? new URL(process.env.APP_ORIGIN).origin
        : req.nextUrl.origin;
      try {
        await acceptRecovery(req.nextUrl.searchParams);
        return NextResponse.redirect(new URL("/reset-password", origin));
      } catch {
        return NextResponse.redirect(
          new URL("/forgot-password?expired=1", origin),
        );
      }
    }
    if (name === "auth/logout" && req.method === "POST") {
      const jar = await cookies();
      const access = jar.get("pa_access")?.value,
        refresh = jar.get("pa_refresh")?.value;
      if (access && refresh) {
        try {
          const client = authClient();
          const { error } = await client.auth.setSession({
            access_token: access,
            refresh_token: refresh,
          });
          if (!error) await client.auth.signOut({ scope: "local" });
        } catch {
          /* Local cookies must still be cleared if Auth is unavailable. */
        }
      }
      for (const cookie of jar.getAll())
        if (cookie.name.startsWith("pa_pkce_")) jar.delete(cookie.name);
      jar.delete("pa_access");
      jar.delete("pa_refresh");
      jar.delete("pa_recovery");
      jar.delete("pa_recovery_verifier");
      return NextResponse.json({ ok: true });
    }
    if (name === "invitations/info" && req.method === "GET") {
      const token = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(req.nextUrl.searchParams.get("token"));
      return NextResponse.json(await invitationInfo(token), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (name === "invitations/accept" && req.method === "POST") {
      const p = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: z.string().min(12).max(128),
          fullName: z.string().trim().min(2).max(100),
        })
        .parse(await bodyJson(req));
      const session = await acceptInvitation(p.token, p.password, p.fullName);
      await saveSession(session);
      return NextResponse.json({ ok: true });
    }
    const u = await currentUser();
    if (name === "uploads/prepare" && req.method === "POST")
      return NextResponse.json(await prepareUpload(u, await bodyJson(req)));
    if (name === "state" && req.method === "GET")
      return NextResponse.json(await snapshot(u), {
        headers: { "Cache-Control": "no-store" },
      });
    if (name === "command" && req.method === "POST") {
      assert(
        Number(req.headers.get("content-length") || 0) < 3800000,
        "Запрос слишком большой",
        413,
      );
      const body = commandSchema.parse(await bodyJson(req, 3800000));
      return NextResponse.json(
        await execute(u, req.headers.get("idempotency-key") || "", body, {
          ua: req.headers.get("user-agent") || undefined,
        }),
      );
    }
    if (
      (path[0] === "files" || path[0] === "packages") &&
      path[1] &&
      req.method === "GET"
    ) {
      const id = z.string().uuid().parse(path[1]);
      const f = await download(u, id, path[0] === "packages");
      // Stream verified bytes: never buffer a >4.5 MB serverless HTTP response.
      let offset = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= f.bytes.length) {
            controller.close();
            return;
          }
          const next = Math.min(offset + 65536, f.bytes.length);
          controller.enqueue(f.bytes.subarray(offset, next));
          offset = next;
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": f.mime,
          "Content-Disposition": `${req.nextUrl.searchParams.get("view") === "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
          "Cache-Control": "private, no-store",
          "X-Content-SHA256": f.sha256,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  } catch (e) {
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "Проверьте заполненные поля", fields: e.flatten() },
        { status: 400 },
      );
    const code = (e as { code?: string }).code;
    if (code === "23505")
      return NextResponse.json(
        { error: "Операция уже выполнена или запись существует" },
        { status: 409 },
      );
    console.error("API failure", e instanceof Error ? e.message : "unknown");
    return NextResponse.json(
      { error: "Ошибка сервера. Повторите запрос позже." },
      { status: 500 },
    );
  }
}
export const GET = route;
export const POST = route;
