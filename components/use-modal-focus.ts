"use client";
import { useEffect, useRef } from "react";
export function useModalFocus(onClose: () => void, blocked: boolean) {
  const ref = useRef<HTMLElement>(null),
    current = useRef({ onClose, blocked });
  current.current = { onClose, blocked };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const available = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "a[href],button,input,select,textarea,[tabindex]",
        ) || [],
      ).filter(
        (e) =>
          !e.hasAttribute("disabled") &&
          e.tabIndex >= 0 &&
          e.getClientRects().length > 0,
      );
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.contains(document.activeElement)) {
        const input = ref.current?.querySelector<HTMLElement>(
          "input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
        );
        (input || available()[0])?.focus();
      }
    });
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !current.current.blocked) {
        e.preventDefault();
        current.current.onClose();
      }
      if (e.key === "Tab") {
        const all = available(),
          first = all[0],
          last = all[all.length - 1];
        if (!first) return;
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !ref.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !ref.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
