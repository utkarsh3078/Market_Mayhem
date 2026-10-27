/**
 * Parse CLIENT_ORIGIN (comma-separated) into exact browser origins. Browsers send
 * `scheme://host[:port]` with no path or trailing slash, so normalise each entry to that form;
 * otherwise "https://app.example/" would silently reject every WebSocket from https://app.example.
 */
export function parseClientOrigins(value: string | undefined): string[] {
  if (!value) return [];
  const origins = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        return entry.replace(/\/+$/, "");
      }
    });
  return [...new Set(origins)];
}
