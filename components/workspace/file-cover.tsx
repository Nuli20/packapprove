"use client";
import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import type { WorkspaceState, Row } from "@/lib/models";
import { thumbnailSlot } from "@/lib/render-queue";
import PdfViewer from "../pdf-viewer";
export function FileCover({
  data,
  artwork,
}: {
  data: WorkspaceState;
  artwork: Row;
}) {
  const root = useRef<HTMLDivElement>(null),
    [visible, V] = useState(false),
    [granted, G] = useState(false),
    release = useRef<(() => void) | null>(null);
  const version =
    data.versions.find((v) => v.id === artwork.active_version_id) ||
    data.versions.find((v) => v.artwork_id === artwork.id);
  const file = data.files.find(
    (f) => f.version_id === version?.id && f.kind === "preview",
  );
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(
      (entries) => V(entries[0].isIntersecting),
      { rootMargin: "120px" },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    G(false);
    if (!visible || file?.mime_type !== "application/pdf") return;
    const abort = new AbortController();
    void thumbnailSlot(abort.signal)
      .then((done) => {
        if (abort.signal.aborted) {
          done();
          return;
        }
        release.current = done;
        G(true);
      })
      .catch(() => {});
    return () => {
      abort.abort();
      release.current?.();
      release.current = null;
    };
  }, [visible, file?.id, file?.mime_type]);
  return (
    <div className="real-file-cover" ref={root}>
      {!file ? (
        <span className="cover-placeholder">
          <Box size={36} />
          <small>—</small>
        </span>
      ) : (
        visible &&
        (file.mime_type === "application/pdf" ? (
          granted ? (
            <PdfViewer
              url={`/api/files/${file.id}?view=1`}
              zoom={0.24}
              page={1}
              onRendered={() => {
                release.current?.();
                release.current = null;
              }}
            />
          ) : (
            <span className="cover-placeholder">PDF…</span>
          )
        ) : (
          <img
            src={`/api/files/${file.id}?view=1`}
            loading="lazy"
            alt={artwork.name}
          />
        ))
      )}
    </div>
  );
}
