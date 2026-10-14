export function buildBrowserlessWebSocketUrl(
  baseUrl: string,
  token: string | undefined,
  reuseConnection = false,
): string {
  if (!token) {
    throw new Error(
      "BROWSERLESS_TOKEN is required when BROWSERLESS_URL is set",
    );
  }
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);
  // The pool owns per-crawl deadlines and idle disconnects. An inherited
  // session timer can otherwise expire in the middle of a later crawl.
  if (reuseConnection && !url.searchParams.has("timeout")) {
    url.searchParams.set("timeout", "-1");
  }
  return url.toString();
}

export function redactBrowserConnectionUrl(connectionUrl: string): string {
  const url = new URL(connectionUrl);
  if (url.searchParams.has("token")) {
    url.searchParams.set("token", "redacted");
  }
  url.username = "";
  url.password = "";
  return url.toString();
}
