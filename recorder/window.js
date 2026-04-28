import { initRecorderPanel } from "./panel.js";

function getTabIdFromUrl() {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("tabId");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function getTabId() {
  const explicit = getTabIdFromUrl();
  if (explicit) return explicit;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

initRecorderPanel(getTabId);
