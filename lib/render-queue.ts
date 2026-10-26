/** Only schedules work; never caches a file, token or user data. */
export function renderQueue(limit: number) {
  let running = 0;
  const waiting: { start: () => void; cancel: () => void }[] = [];
  const pump = () => {
    while (running < limit && waiting.length) waiting.shift()!.start();
  };
  return (signal: AbortSignal) =>
    new Promise<() => void>((resolve, reject) => {
      let started = false,
        released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (started) running--;
        pump();
      };
      const entry = {
        start: () => {
          if (signal.aborted) return entry.cancel();
          started = true;
          running++;
          signal.removeEventListener("abort", entry.cancel);
          resolve(release);
        },
        cancel: () => {
          const i = waiting.indexOf(entry);
          if (i >= 0) waiting.splice(i, 1);
          reject(new DOMException("Cancelled", "AbortError"));
        },
      };
      if (signal.aborted) return entry.cancel();
      signal.addEventListener("abort", entry.cancel, { once: true });
      waiting.push(entry);
      pump();
    });
}
export const thumbnailSlot = renderQueue(2);
