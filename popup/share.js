export async function createLocalShareLink(report) {
  const shareId = `bugsnap_${Date.now()}_${crypto.randomUUID()}`;
  await chrome.storage.local.set({
    [shareId]: {
      ...report,
      storedAt: new Date().toISOString(),
    },
  });
  return chrome.runtime.getURL(`viewer.html?report=${encodeURIComponent(shareId)}`);
}

export function copyShareLink(link) {
  return navigator.clipboard.writeText(link);
}
