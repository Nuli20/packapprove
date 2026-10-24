import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { currentUser, saveSession } from "@/lib/auth";
import { authClient } from "@/lib/platform";
import { snapshot, download } from "@/lib/queries";
import { execute, commandSchema } from "@/lib/service";
import { invitationInfo, acceptInvitation } from "@/lib/invitations";
import { AppError, assert } from "@/lib/security";
export const runtime = "nodejs";
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
            ? origin === process.env.APP_ORIGIN
            : new URL(origin).host === req.headers.get("host")),
        "Недопустимый Origin",
        403,
      );
    }
    if (name === "health")
      return NextResponse.json({ status: "ok", service: "PackApprove" });
    if (name === "auth/login" && req.method === "POST") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "local";
      const now = Date.now();
      const a = attempts.get(ip);
      if (a && now - a.at < 60000) {
        assert(a.n < 30, "Повторите вход через минуту", 429);
        a.n++;
      } else attempts.set(ip, { n: 1, at: now });
      const input = z
        .object({ email: z.email(), password: z.string().min(8).max(128) })
        .parse(await bodyJson(req));
      const { data, error } = await authClient().auth.signInWithPassword(input);
      assert(!error && data.session, "Неверный email или пароль", 401);
      await saveSession(data.session);
      return NextResponse.json({ ok: true });
    }
    if (name === "auth/logout") {
      const jar = await cookies();
      jar.delete("pa_access");
      jar.delete("pa_refresh");
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
    if (name === "state" && req.method === "GET")
      return NextResponse.json(await snapshot(u), {
        headers: { "Cache-Control": "no-store" },
      });
    if (name === "command" && req.method === "POST") {
      assert(
        Number(req.headers.get("content-length") || 0) < 105000000,
        "Запрос слишком большой",
        413,
      );
      const body = commandSchema.parse(await bodyJson(req, 105000000));
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
      return new Response(f.bytes as BodyInit, {
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
