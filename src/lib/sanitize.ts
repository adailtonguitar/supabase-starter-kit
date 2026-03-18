import DOMPurify from "dompurify";

export function escapeHtml(input: unknown): string {
  const text = String(input ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function escapeAttr(input: unknown): string {
  // Attributes need at least the same escaping; we also strip newlines to reduce injection surface.
  return escapeHtml(input).replace(/[\r\n]/g, "");
}

export function safeUrl(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.origin);
    const p = url.protocol.toLowerCase();
    if (p === "http:" || p === "https:") return url.toString();
    // Allow only image data URLs (common for logos) to avoid javascript: and other schemes.
    if (p === "data:" && raw.toLowerCase().startsWith("data:image/")) return raw;
    return "";
  } catch {
    return "";
  }
}

export function sanitizeHtml(input: unknown): string {
  return DOMPurify.sanitize(String(input ?? ""), {
    // Keep it conservative; allow common receipt markup.
    USE_PROFILES: { html: true },
  });
}

