"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
/** One document per URL. Zoom/page changes rerender it without redownloading. */
export default function PdfViewer({
  url,
  zoom,
  page,
  onPages,
  onRendered,
}: {
  url: string;
  zoom: number;
  page: number;
  onPages?: (n: number) => void;
  onRendered?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    task = useRef<RenderTask | null>(null),
    callbacks = useRef({ onPages, onRendered });
  callbacks.current = { onPages, onRendered };
  const [pdf, P] = useState<PDFDocumentProxy | null>(null),
    [error, E] = useState("");
  useEffect(() => {
    let dead = false,
      loading: { destroy: () => Promise<void> } | undefined;
    P(null);
    E("");
    void (async () => {
      const api = await import("pdfjs-dist");
      if (dead) return;
      api.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const load = api.getDocument({
        url,
        enableXfa: false,
        maxImageSize: 32000000,
        canvasMaxAreaInBytes: 32 * 1024 * 1024,
        cMapUrl: "/pdf-assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf-assets/standard_fonts/",
        wasmUrl: "/pdf-assets/wasm/",
      });
      loading = load;
      const document = await load.promise;
      if (dead) return;
      callbacks.current.onPages?.(document.numPages);
      P(document);
    })().catch((e) => {
      if (!dead) {
        E("PDF: " + e.message);
        callbacks.current.onRendered?.();
      }
    });
    return () => {
      dead = true;
      task.current?.cancel();
      void loading?.destroy().catch(() => {});
    };
  }, [url]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false,
      current: RenderTask | undefined;
    const previous = task.current;
    previous?.cancel();
    if (canvas.current) canvas.current.dataset.rendered = "false";
    void (async () => {
      await previous?.promise.catch(() => {});
      if (cancelled) return;
      const p = await pdf.getPage(Math.max(1, Math.min(page, pdf.numPages)));
      if (cancelled || !canvas.current) return;
      const viewport = p.getViewport({ scale: zoom * 1.1 }),
        c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      current = p.render({ canvas: c, viewport });
      task.current = current;
      await current.promise;
      if (!cancelled) {
        c.dataset.rendered = "true";
        callbacks.current.onRendered?.();
      }
    })().catch((e) => {
      if (!cancelled && e.name !== "RenderingCancelledException") {
        E("PDF: " + e.message);
        callbacks.current.onRendered?.();
      }
    });
    return () => {
      cancelled = true;
      current?.cancel();
    };
  }, [pdf, zoom, page]);
  return error ? (
    <div className="alert error" role="alert">
      {error}
    </div>
  ) : (
    <canvas ref={canvas} className="pdf-canvas" aria-label="PDF" />
  );
}
