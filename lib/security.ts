import { createHash } from "node:crypto";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(ok: unknown, message: string, status = 409): asserts ok {
  if (!ok) throw new AppError(status, message);
}
export function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function detectMime(bytes: Uint8Array) {
  assert(
    bytes.length > 0 && bytes.length <= 25 * 1024 * 1024,
    "Допустимый размер файла: до 25 МБ",
    400,
  );
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  throw new AppError(
    400,
    "Разрешены только PDF, PNG и JPEG; тип проверяется по содержимому",
  );
}
export const internalRoles = ["admin", "manager", "designer", "prepress"];
export function permit(role: string, roles: string[]) {
  assert(roles.includes(role), "Недостаточно прав", 403);
}
