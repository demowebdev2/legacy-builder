/** POSTs JSON to one of our route handlers and returns `{ data }` or `{ error }` with a user-facing message. */
export async function postJson<T>(url: string, body: unknown): Promise<{ data: T; error?: undefined } | { data?: undefined; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !json || json.error) {
      return { error: json?.error ?? "Something went wrong. Please try again." };
    }
    return { data: json };
  } catch {
    return { error: "We could not reach Legacy Builders. Check your connection and try again." };
  }
}

/** Maps zod issues to `{ "path.to.field": message }` (first message per field). */
export function issuesToErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Focuses the first control whose `name` (or `data-field`) matches an error key, in DOM order. */
export function focusFirstError(container: HTMLElement | null, errors: Record<string, string>) {
  if (!container) return;
  const keys = new Set(Object.keys(errors));
  const controls = container.querySelectorAll<HTMLElement>("[name], [data-field]");
  for (const el of Array.from(controls)) {
    const key = el.getAttribute("name") ?? el.getAttribute("data-field");
    if (key && keys.has(key)) {
      el.focus();
      if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
  }
}
