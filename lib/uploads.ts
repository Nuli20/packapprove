import { boundedImageDimensions } from "./can-spec";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { asUser, type Tx } from "./db";
import { storageClient } from "./platform";
import { assert, permit, detectMime, sha256, AppError } from "./security";
import type { User } from "./service";
export const uploadSchema = z.object({
  artworkId: z.string().uuid(),
  kind: z.enum(["source", "preview", "production"]),
  filename: z.string().min(1).max(180),
  size: z.number().int().positive().max(26214400),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function prepareUpload(u: User, body: unknown) {
  permit(u.role, ["designer"]);
  const p = uploadSchema.parse(body);
  return asUser(u.id, async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${"uploads:" + u.id},0))`;
    const [a] = await tx`select * from artworks where id=${p.artworkId}`;
    assert(a, "Макет недоступен", 404);
    const [{ count }] =
      await tx`select count(*)::int as count from upload_tickets where user_id=${u.id} and created_at>now()-interval '1 minute'`;
    assert(count < 12, "Слишком много загрузок. Повторите через минуту.", 429);
    const id = randomUUID(),
      path = `_quarantine/${u.id}/${id}`;
    await tx`insert into upload_tickets(id,user_id,artwork_id,kind,filename,storage_path,expected_size,expected_sha256) values(${id},${u.id},${p.artworkId},${p.kind},${p.filename},${path},${p.size},${p.sha256})`;
    const { data, error } = await storageClient().createSignedUploadUrl(path, {
      upsert: false,
    });
    assert(!error && data, "Не удалось подготовить приватную загрузку", 502);
    return { id, signedUrl: data.signedUrl, expiresInSeconds: 7200 };
  });
}
export async function verifiedUpload(
  tx: Tx,
  u: User,
  id: string,
  artworkId: string,
  kind: string,
) {
  const [ticket] =
    await tx`select * from upload_tickets where id=${id} for update`;
  assert(
    ticket &&
      ticket.user_id === u.id &&
      ticket.artwork_id === artworkId &&
      ticket.kind === kind,
    "Загрузка не принадлежит этому макету",
    403,
  );
  assert(
    ticket.status === "pending" && new Date(ticket.expires_at) > new Date(),
    "Загрузка уже использована или истекла",
    409,
  );
  const { data, error } = await storageClient().download(ticket.storage_path);
  assert(!error && data, "Файл не загружен в приватное хранилище", 409);
  assert(
    data.size === Number(ticket.expected_size) && data.size <= 26214400,
    "Размер загруженного файла не совпадает",
    400,
  );
  const bytes = Buffer.from(await data.arrayBuffer());
  const mime = detectMime(bytes);
  validateImageSize(bytes, mime);
  assert(
    sha256(bytes) === ticket.expected_sha256,
    "SHA-256 загруженного файла не совпадает",
    400,
  );
  // Never bind the signed-upload destination to a version. The verified bytes are
  // copied into a new server-only identity, immune to reuse of the upload token.
  await tx`update upload_tickets set status='consumed' where id=${id}`;
  return {
    bytes,
    mime,
    filename: ticket.filename,
    stagingPath: ticket.storage_path,
  };
}

export function validateImageSize(bytes: Uint8Array, mime: string) {
  if (mime.startsWith("image/")) {
    try {
      boundedImageDimensions(bytes, mime);
    } catch (e) {
      throw new AppError(400, (e as Error).message);
    }
  }
}
