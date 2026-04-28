// content.js — BugSnap Content Script
// Coleta informações da página e também instrumenta console/network no contexto real da página.

(function () {
  const MAX_CONSOLE_LOGS = 200;
  const MAX_NETWORK_REQUESTS = 100;
  const consoleLogs = [];
  const networkRequests = [];
  const SOURCE = "BUGSNAP_PAGE_EVENT";
  const CONTENT_FLAG = "__BUGSNAP_CONTENT_INJECTED__";
  listenToPageEvents();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_PAGE_INFO") {
      sendResponse(getPageInfo());
      return true;
    }

    if (msg.type === "GET_DEBUG_DATA") {
      sendResponse({
        consoleLogs: consoleLogs.slice(-MAX_CONSOLE_LOGS),
        networkRequests: networkRequests.slice(-MAX_NETWORK_REQUESTS),
      });
      return true;
    }

    if (msg.type === "CLEAR_DEBUG_DATA") {
      consoleLogs.length = 0;
      networkRequests.length = 0;
      sendResponse({ ok: true });
      return true;
    }
  });

  function getPageInfo() {
    return {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      readyState: document.readyState,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      timestamp: new Date().toISOString(),
      localTime: new Date().toLocaleString("pt-BR"),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      performance: getPerformanceInfo(),
    };
  }

  function getPerformanceInfo() {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return null;
      return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        loadTime: Math.round(nav.loadEventEnd - nav.startTime),
        ttfb: Math.round(nav.responseStart - nav.requestStart),
      };
    } catch {
      return null;
    }
  }

  function listenToPageEvents() {
    if (window[CONTENT_FLAG]) return;
    window[CONTENT_FLAG] = true;

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== SOURCE) return;

      const payload = event.data.payload;
      if (!payload) return;

      if (payload.kind === "console" && payload.entry) {
        consoleLogs.push(payload.entry);
        trimBuffer(consoleLogs, MAX_CONSOLE_LOGS);
      }

      if (payload.kind === "network" && payload.entry) {
        networkRequests.push(payload.entry);
        trimBuffer(networkRequests, MAX_NETWORK_REQUESTS);
      }
    });
  }

  function trimBuffer(list, max) {
    while (list.length > max) list.shift();
  }
})();
