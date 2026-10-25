import { visualMime, boundedImageDimensions } from "./can-spec";
const fileMetadata = new WeakMap<
  File,
  Promise<{ sha256: string; mime: string }>
>();
async function metadata(file: File) {
  let pending = fileMetadata.get(file);
  if (!pending) {
    pending = (async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = visualMime(bytes);
      if (mime.startsWith("image/")) boundedImageDimensions(bytes, mime);
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return { sha256, mime };
    })();
    fileMetadata.set(file, pending);
  }
  return pending;
}
export async function directUpload(
  artworkId: string,
  kind: string,
  file: File,
) {
  if (!file.size || file.size > 25 * 1024 * 1024)
    throw Error("Размер файла: от 1 байта до 25 МБ.");
  const { sha256, mime } = await metadata(file);
  const prepared = await fetch("/api/uploads/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artworkId,
      kind,
      filename: file.name,
      size: file.size,
      sha256,
    }),
  });
  const ticket = await prepared.json();
  if (!prepared.ok) {
    if (prepared.status === 401)
      location.href = "/login?reason=session-expired";
    throw Error(ticket.error || "Не удалось подготовить загрузку");
  }
  const response = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mime,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok)
    throw Error(
      "Загрузка в Storage прервана. Повторите отправку; версия ещё не создана.",
    );
  return { kind, filename: file.name, uploadId: ticket.id };
}
