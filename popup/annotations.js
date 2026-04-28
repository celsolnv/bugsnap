import { $, clamp } from "../utils/helpers.js";

export function createAnnotationController() {
  const state = {
    tool: "pen",
    color: "#f04d4d",
    items: [],
    draft: null,
    drawing: false,
  };

  function init() {
    bindToolButton("tool-pen", "pen");
    bindToolButton("tool-rect", "rect");
    bindColorButton("color-red", "#f04d4d");
    bindColorButton("color-yellow", "#f5c842");
    bindColorButton("color-green", "#3dd68c");
    bindColorButton("color-blue", "#55b9ff");

    $("tool-undo").addEventListener("click", undo);
    $("tool-clear").addEventListener("click", clear);

    const canvas = $("annotation-canvas");
    const image = $("screenshot-img");
    image.addEventListener("load", syncSize);
    window.addEventListener("resize", syncSize);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
  }

  function bindToolButton(id, tool) {
    $(id).addEventListener("click", () => {
      state.tool = tool;
      document.querySelectorAll(".tool-group .tool-btn").forEach((btn) => btn.classList.remove("active"));
      $(id).classList.add("active");
    });
  }

  function bindColorButton(id, color) {
    $(id).addEventListener("click", () => {
      state.color = color;
      document.querySelectorAll(".color-btn").forEach((btn) => btn.classList.remove("active"));
      $(id).classList.add("active");
    });
  }

  function reset() {
    state.items = [];
    state.draft = null;
    state.drawing = false;
    syncSize();
  }

  function undo() {
    state.items.pop();
    state.draft = null;
    redraw();
  }

  function clear() {
    state.items = [];
    state.draft = null;
    redraw();
  }

  function syncSize() {
    const image = $("screenshot-img");
    const canvas = $("annotation-canvas");
    if (!image || !canvas || !image.complete || !image.clientWidth) return;
    canvas.width = image.clientWidth;
    canvas.height = image.clientHeight;
    canvas.style.width = `${image.clientWidth}px`;
    canvas.style.height = `${image.clientHeight}px`;
    redraw();
  }

  function onPointerDown(event) {
    if (!$("screenshot-img").src) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    state.drawing = true;
    state.draft =
      state.tool === "pen"
        ? { type: "pen", color: state.color, points: [point] }
        : { type: "rect", color: state.color, start: point, end: point };
  }

  function onPointerMove(event) {
    if (!state.drawing || !state.draft) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    if (state.draft.type === "pen") state.draft.points.push(point);
    else state.draft.end = point;
    redraw();
  }

  function onPointerUp(event) {
    if (!state.drawing || !state.draft) return;
    const point = getCanvasPoint(event);
    if (point) {
      if (state.draft.type === "pen") state.draft.points.push(point);
      else state.draft.end = point;
    }
    state.drawing = false;
    state.items.push(normalizeAnnotation(state.draft));
    state.draft = null;
    redraw();
  }

  function normalizeAnnotation(item) {
    if (item.type === "pen") {
      return { type: "pen", color: item.color, points: item.points.filter(Boolean) };
    }
    return { type: "rect", color: item.color, start: item.start, end: item.end };
  }

  function getCanvasPoint(event) {
    const canvas = $("annotation-canvas");
    if (!canvas.width || !canvas.height) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function redraw() {
    const canvas = $("annotation-canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    [...state.items, state.draft]
      .filter(Boolean)
      .forEach((item) => drawAnnotation(ctx, item, canvas.width, canvas.height));
  }

  function drawAnnotation(ctx, item, width, height) {
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = Math.max(2, Math.round(width * 0.008));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (item.type === "pen") {
      if (!item.points.length) {
        ctx.restore();
        return;
      }
      ctx.beginPath();
      item.points.forEach((point, index) => {
        const x = point.x * width;
        const y = point.y * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
      return;
    }

    const x1 = item.start.x * width;
    const y1 = item.start.y * height;
    const x2 = item.end.x * width;
    const y2 = item.end.y * height;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.restore();
  }

  function getItems() {
    return state.items.slice();
  }

  function getExportScreenshot(baseScreenshot) {
    if (!baseScreenshot) return null;
    if (!state.items.length) return baseScreenshot;
    const image = $("screenshot-img");
    if (!image?.naturalWidth || !image?.naturalHeight) return baseScreenshot;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return baseScreenshot;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    state.items.forEach((item) => drawAnnotation(ctx, item, canvas.width, canvas.height));
    return canvas.toDataURL("image/png");
  }

  return { init, reset, getItems, getExportScreenshot };
}
