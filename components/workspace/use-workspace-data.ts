"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/lib/models";

/** Cache is owned by one mounted cabinet, never shared across requests or users. */
export function useWorkspaceData(url: string) {
  const [data, setData] = useState<WorkspaceState | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const cache = useRef(new Map<string, { data: WorkspaceState; at: number }>()),
    pending = useRef<AbortController | null>(null),
    current = useRef(url),
    resolved = useRef(""),
    userId = useRef("");
  current.current = url;
  const load = useCallback(async (force = true) => {
    const key = current.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const cached = cache.current.get(key);
    if (!force && cached && Date.now() - cached.at < 15000) {
      setData(cached.data);
      resolved.current = key;
      setLoading(false);
      return;
    }
    const screen = (u: string) => {
      const p = new URLSearchParams(u.split("?")[1]);
      return ["view", "project", "artwork", "version", "compare"]
        .map((k) => p.get(k))
        .join("|");
    };
    setLoading(!resolved.current || screen(resolved.current) !== screen(key));
    setError("");
    try {
      const r = await fetch(key, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (r.status === 401) {
        cache.current.clear();
        setData(null);
        location.assign("/login?reason=session-expired");
        return;
      }
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 403 || r.status === 404) {
          cache.current.clear();
          setData(null);
          resolved.current = "";
        }
        throw Error(j.error || "Не удалось загрузить данные");
      }
      if (controller.signal.aborted || current.current !== key) return;
      const identity = [j.user.id, j.user.role, j.user.row_version].join(":");
      if (userId.current && userId.current !== identity) cache.current.clear();
      userId.current = identity;
      resolved.current = key;
      cache.current.set(key, { data: j, at: Date.now() });
      if (cache.current.size > 12)
        cache.current.delete(cache.current.keys().next().value!);
      setData(j);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError((e as Error).message);
        throw e;
      }
    } finally {
      if (!controller.signal.aborted && current.current === key)
        setLoading(false);
    }
    // data is deliberately not a fetch dependency; responses are identified by URL/AbortController.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load(false).catch(() => {});
    return () => pending.current?.abort();
  }, [url, load]);
  const refresh = useCallback(async () => {
    cache.current.clear();
    await load(true);
  }, [load]);
  const clear = useCallback(() => {
    pending.current?.abort();
    cache.current.clear();
    userId.current = "";
    resolved.current = "";
    setData(null);
  }, []);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("packapprove-session");
    channel.onmessage = (e) => {
      if (e.data === "login" || e.data === "logout") {
        clear();
        location.assign("/login?reason=session-changed");
      }
    };
    return () => channel.close();
  }, [clear]);
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState === "visible")
        void load(false).catch(() => {});
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load]);
  return { data, setData, error, setError, loading, refresh, clear };
}
