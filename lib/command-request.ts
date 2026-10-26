/** One instance per cabinet/form. An ambiguous network failure retries with the same key. */
export function commandTransport() {
  const keys = new Map<string, string>();
  return async (
    action: string,
    entityId: string | undefined,
    payload: Record<string, unknown>,
    rowVersion?: number,
  ) => {
    const body = JSON.stringify({ action, entityId, payload, rowVersion });
    let key = keys.get(body);
    if (!key) {
      key = crypto.randomUUID();
      keys.set(body, key);
    }
    if (keys.size > 32) keys.delete(keys.keys().next().value!);
    const r = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body,
    });
    const result = await r.json();
    if (r.status === 401) {
      keys.clear();
      location.assign("/login?reason=session-expired");
      throw Error("Сессия истекла. Войдите снова.");
    }
    if (!r.ok)
      throw Object.assign(
        Error(result.error || "Не удалось сохранить данные"),
        { status: r.status },
      );
    keys.delete(body);
    return result;
  };
}
