export const $ = (id) => document.getElementById(id);

export function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function fmtText(value) {
  return String(value ?? "—").replace(/\r?\n/g, " ").trim() || "—";
}

export function fmtTable(value) {
  return fmtText(value).replace(/\|/g, "\\|");
}

export function fmtInlineCode(value) {
  return `\`${fmtText(value).replace(/`/g, "'")}\``;
}

export function fmtLogLine(value) {
  return fmtText(value).replace(/`/g, "'").replace(/\u0000/g, "");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
