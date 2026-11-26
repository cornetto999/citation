/** Browser protections shared by successful pages, API responses and errors. */
export function withSecurityHeaders(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set(
    "Permissions-Policy",
    "camera=(self), geolocation=(self), microphone=(), payment=()",
  );
  // Keep SSR hydration and the existing local camera/QR flows compatible.
  // This is a baseline CSP, not a full script-src/nonce policy.
  headers.append(
    "Content-Security-Policy",
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (new URL(request.url).protocol === "https:")
    headers.set("Strict-Transport-Security", "max-age=31536000");
  if (
    new URL(request.url).pathname.startsWith("/api/") ||
    headers.get("content-type")?.includes("text/html")
  )
    headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
