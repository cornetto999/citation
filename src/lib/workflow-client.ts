/** Shared authenticated workflow requests; server errors stay visible to staff. */
export async function workflowRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const result = await response.json().catch(() => null);
  if (response.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new Event("citation-session-expired"));
  if (!response.ok)
    throw new Error(
      result?.error ||
        (response.status === 401
          ? "Your session has expired. Sign in again."
          : "Unable to load records. Please retry."),
    );
  if (result === null)
    throw new Error(
      "The server returned an unreadable response. Please retry.",
    );
  return result as T;
}

export function workflowParams(
  values: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}
