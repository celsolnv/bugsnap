import { getMergedDebugData } from "../popup/collect.js";

export const Recorder = (() => {
  let mediaStream = null;
  let mediaRecorder = null;
  let chunks = [];
  let startTime = null;
  let timerInterval = null;
  let pollInterval = null;
  let previewUrl = null;

  let sessionLogs = [];
  let sessionNetwork = [];
  let sessionDiagnostics = {};
  let sessionTabId = null;

  let seenConsoleKeys = new Set();
  let seenNetworkKeys = new Set();
  let sessionState = "idle";

  const callbacks = {
    onStateChange: null,
    onStart: null,
    onStop: null,
    onTick: null,
    onError: null,
  };

  function on(event, fn) {
    callbacks[event] = fn;
  }

  function emit(event, ...args) {
    if (callbacks[event]) callbacks[event](...args);
  }

  function setState(nextState, payload) {
    sessionState = nextState;
    emit("onStateChange", nextState, payload);
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      if (!startTime) return;
      emit("onTick", Date.now() - startTime);
    }, 500);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  async function collectDebugSnapshot() {
    if (!sessionTabId || !startTime) return;

    try {
      const snapshot = await getMergedDebugData(sessionTabId);
      sessionDiagnostics = snapshot.debugDiagnostics || {};

      snapshot.consoleLogs.forEach((entry) => {
        const key = getConsoleKey(entry);
        if (seenConsoleKeys.has(key)) return;
        seenConsoleKeys.add(key);
        sessionLogs.push({
          ...entry,
          _offsetMs: getOffsetMs(entry.timestamp),
        });
      });

      snapshot.networkRequests.forEach((entry) => {
        const key = getNetworkKey(entry);
        if (seenNetworkKeys.has(key)) return;
        seenNetworkKeys.add(key);
        sessionNetwork.push({
          ...entry,
          _offsetMs: getOffsetMs(entry.timestamp),
        });
      });
    } catch {
      // Mantem silencioso; a UI de diagnostico da sessao resume a situacao.
    }
  }

  function getOffsetMs(timestamp) {
    if (!startTime) return 0;
    const eventTime = timestamp ? new Date(timestamp).getTime() : Date.now();
    return Math.max(0, eventTime - startTime);
  }

  async function seedBaseline(tabId) {
    const baseline = await getMergedDebugData(tabId);
    sessionDiagnostics = baseline.debugDiagnostics || {};
    seenConsoleKeys = new Set(baseline.consoleLogs.map(getConsoleKey));
    seenNetworkKeys = new Set(baseline.networkRequests.map(getNetworkKey));
  }

  function bindTrackStop(stream) {
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (sessionState === "recording" || sessionState === "awaiting-permission") {
          stop("Compartilhamento encerrado pelo navegador.");
        }
      });
    });
  }

  async function start(tabId) {
    if (sessionState === "recording" || sessionState === "awaiting-permission" || sessionState === "stopping") {
      return;
    }

    setState("awaiting-permission");

    try {
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn("Sem acesso ao microfone", err);
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });

      if (!displayStream) {
        setState("idle");
        emit("onError", "Gravacao cancelada.");
        return;
      }


      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const destNode = audioContext.createMediaStreamDestination();
      let gotAudio = false;

      if (displayStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(new MediaStream(displayStream.getAudioTracks())).connect(destNode);
        gotAudio = true;
      }

      if (micStream && micStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(micStream).connect(destNode);
        gotAudio = true;
      }

      const tracks = [...displayStream.getVideoTracks()];
      if (gotAudio) {
        tracks.push(...destNode.stream.getAudioTracks());
      }

      mediaStream = new MediaStream(tracks);
      mediaStream._displayStream = displayStream;
      mediaStream._micStream = micStream;

      bindTrackStop(mediaStream);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }

      chunks = [];
      sessionLogs = [];
      sessionNetwork = [];
      sessionDiagnostics = {};
      sessionTabId = tabId;
      startTime = Date.now();

      await seedBaseline(tabId);

      const mimeType = getSupportedMimeType();
      mediaRecorder = mimeType
        ? new MediaRecorder(mediaStream, {
            mimeType,
            videoBitsPerSecond: 2_500_000,
          })
        : new MediaRecorder(mediaStream, {
            videoBitsPerSecond: 2_500_000,
          });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        emit("onError", event.error?.message ?? "Erro na gravacao.");
        stop();
      };

      mediaRecorder.onstop = async () => {
        setState("stopping");
        stopTimer();
        clearInterval(pollInterval);
        pollInterval = null;

        await collectDebugSnapshot();

        const finalMimeType = mimeType || mediaRecorder.mimeType || "video/webm";
        const blob = new Blob(chunks, { type: finalMimeType });
        previewUrl = URL.createObjectURL(blob);
        const duration = startTime ? Date.now() - startTime : 0;

        mediaStream?.getTracks().forEach((track) => track.stop());
        mediaStream?._displayStream?.getTracks().forEach((track) => track.stop());
        mediaStream?._micStream?.getTracks().forEach((track) => track.stop());
        mediaStream = null;

        const session = {
          videoUrl: previewUrl,
          blob,
          mimeType: finalMimeType,
          duration,
          startedAt: startTime ? new Date(startTime).toISOString() : null,
          consoleLogs: sessionLogs.slice(),
          networkRequests: sessionNetwork.slice(),
          debugDiagnostics: sessionDiagnostics,
          summary: buildSummary(),
          tabId: sessionTabId,
        };

        setState("done", session);
        emit("onStop", session);
      };

      mediaRecorder.start(1000);
      startTimer();
      await collectDebugSnapshot();
      pollInterval = setInterval(collectDebugSnapshot, 1000);

      setState("recording", { startedAt: startTime });
      emit("onStart", { startedAt: startTime });
    } catch (error) {
      cleanup();
      setState("error");

      if (error.name === "NotAllowedError") {
        emit("onError", "Permissao negada. Clique em 'Compartilhar' no dialogo do Chrome.");
      } else if (error.name === "AbortError") {
        emit("onError", "Gravacao cancelada.");
      } else {
        emit("onError", error.message ?? "Erro desconhecido.");
      }
    }
  }

  function stop(reason) {
    if (reason) {
      emit("onError", reason);
    }

    if (!mediaRecorder || sessionState === "idle" || sessionState === "done") return;
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }

  function cleanup() {
    clearInterval(pollInterval);
    pollInterval = null;
    stopTimer();
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream?._displayStream?.getTracks().forEach((track) => track.stop());
    mediaStream?._micStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    mediaRecorder = null;
    chunks = [];
  }

  function buildSummary() {
    return {
      totalLogs: sessionLogs.length,
      errors: sessionLogs.filter((log) => log.type === "error").length,
      warnings: sessionLogs.filter((log) => log.type === "warn" || log.type === "warning").length,
      totalRequests: sessionNetwork.length,
      failedRequests: sessionNetwork.filter((req) => req.status >= 400 || req.failed).length,
    };
  }

  function getConsoleKey(entry) {
    return `${entry.type}|${(entry.args || []).join(" ")}|${entry.timestamp || ""}`;
  }

  function getNetworkKey(entry) {
    return `${entry.method || ""}|${entry.status}|${entry.url}|${entry.timestamp || ""}`;
  }

  function getSupportedMimeType() {
    const types = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }

    return "";
  }

  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remaining = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${remaining}`;
  }

  function getState() {
    return {
      state: sessionState,
      isRecording: sessionState === "recording",
      startTime,
      elapsed: startTime ? Date.now() - startTime : 0,
    };
  }

  function downloadVideo(blob, mimeType, prefix = "bugsnap-recording") {
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${prefix}-${date}.${ext}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadSessionJSON(sessionData, prefix = "bugsnap-session") {
    const date = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${prefix}-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    start,
    stop,
    on,
    formatDuration,
    getState,
    downloadVideo,
    downloadSessionJSON,
  };
})();
