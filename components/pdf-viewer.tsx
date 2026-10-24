"use client";
import { useEffect, useRef, useState } from "react";
export default function PdfViewer({
  url,
  zoom,
  page,
  onPages,
}: {
  url: string;
  zoom: number;
  page: number;
  onPages?: (n: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, E] = useState("");
  useEffect(() => {
    let dead = false;
    let task: { cancel: () => void } | undefined;
    let document: { destroy: () => Promise<void> } | undefined;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const load = pdfjs.getDocument({ url, enableXfa: false });
      const pdf = await load.promise;
      document = load;
      if (dead) {
        await load.destroy();
        return;
      }
      onPages?.(pdf.numPages);
      const p = await pdf.getPage(Math.min(page, pdf.numPages));
      if (dead || !canvas.current) return;
      const viewport = p.getViewport({ scale: zoom * 1.1 });
      const c = canvas.current;
      c.dataset.rendered = "false";
      c.width = viewport.width;
      c.height = viewport.height;
      task = p.render({ canvas: c, viewport });
      await (task as unknown as { promise: Promise<unknown> }).promise;
      if (!dead) c.dataset.rendered = "true";
    })().catch((e) => {
      if (!dead && e.name !== "RenderingCancelledException")
        E("PDF: " + e.message);
    });
    return () => {
      dead = true;
      task?.cancel();
      void document?.destroy();
    };
  }, [url, zoom, page, onPages]);
  return error ? (
    <div className="alert error">{error}</div>
  ) : (
    <canvas ref={canvas} className="pdf-canvas" />
  );
}
