import { visualMime, boundedImageDimensions } from "./can-spec";
export async function rasterDesign(
  source: File | { url: string; sha256: string },
  page: number,
  signal: AbortSignal,
  retain?: { filename: string },
) {
  let bytes: Uint8Array<ArrayBuffer>;
  if (source instanceof File)
    bytes = new Uint8Array(await source.arrayBuffer());
  else {
    const response = await fetch(source.url, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 401) {
      location.href = "/login?reason=session-expired";
      throw Error("Сессия истекла. Войдите снова.");
    }
    if (!response.ok)
      throw Error("Файл недоступен. Проверьте права или повторите запрос.");
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const mime = visualMime(bytes);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (!(source instanceof File) && hash !== source.sha256)
    throw Error("SHA-256 предпросмотра не совпадает с сохранённым файлом.");
  const originalFile = retain
    ? new File([bytes], retain.filename, { type: mime })
    : undefined;
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const canvas = document.createElement("canvas");
  let pages = 1;
  if (mime === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const loading = pdfjs.getDocument({
      data: bytes,
      enableXfa: false,
      stopAtErrors: true,
      maxImageSize: 32000000,
      canvasMaxAreaInBytes: 32 * 1024 * 1024,
      cMapUrl: "/pdf-assets/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdf-assets/standard_fonts/",
      wasmUrl: "/pdf-assets/wasm/",
    });
    try {
      const pdf = await loading.promise;
      pages = pdf.numPages;
      const pdfPage = await pdf.getPage(Math.min(page, pages));
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(2, 2048 / Math.max(base.width, base.height));
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const render = pdfPage.render({ canvas, viewport });
      const cancel = () => render.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        await render.promise;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    } finally {
      await loading.destroy();
    }
  } else {
    boundedImageDimensions(bytes, mime);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    try {
      if (bitmap.width * bitmap.height > 32000000)
        throw Error("Изображение превышает 32 мегапикселя.");
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } finally {
      bitmap.close();
    }
  }
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return { canvas, pages, hash, mime, originalFile };
}
