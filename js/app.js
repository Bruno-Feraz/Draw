import { $ } from "./dom.js";
import { toast } from "./dom.js";
import { state, DRAW_SIZES, ensureDrawLayers, ensurePixelLayers } from "./state.js";
import { hooks } from "./hooks.js";
import { wrap, draw, onDown, onMove, onUp, finishPolyline, undo as undo2d, redo as redo2d, addImageAt, endTextEdit } from "./draw2d.js";
import { chrome, buildRail, syncPanel, syncFnBar, setTool, togglePanel, toggleBox, handleFn, act, view3d, applyStroke, renderBox } from "./ui.js";
import { saveProject, openProjectFile, loadBoxEntry, saveCurrentToBox } from "./io.js";
import { cmdKey } from "./keys.js";
import { copySelection, pasteSelection } from "./clipboard.js";

if (navigator.userAgent.includes("Electron")) document.documentElement.classList.add("is-electron");

hooks.draw = draw;
hooks.syncPanel = syncPanel;
hooks.syncFnBar = syncFnBar;
hooks.stashBox = () => {
  if (state.session) saveCurrentToBox();
};

const io = {
  save: saveProject,
  open: async () => {
    const data = await openProjectFile();
    if (!data) return;
    await applyOpened(data);
    toast("Progetto aperto");
  },
  undo2d,
  redo2d,
};

async function applyOpened(data, resetName = false) {
  const sess = data.session;
  if (sess === "draw") openDraw(false, state.page);
  else if (sess === "pixel") openPixel(state.pixelN, false);
  else if (sess === "model") await openModel(false);
  if (data.model && hooks.scene) hooks.scene.load(data.model);
  if (resetName) { /* keep */ }
  draw();
  syncPanel();
  syncFnBar();
  renderBox();
}

function freshDoc(name) {
  state.docId = crypto.randomUUID();
  state.docName = name || "Foglio";
}

function openDraw(reset = true, page) {
  state.session = "draw";
  state.picking = false;
  if (page) state.page = { w: page.w || 1920, h: page.h || 1080, infinite: !!page.infinite };
  state.zoom = page?.infinite ? 1 : 1;
  state.pan = { x: 0, y: 0 };
  state.tool = "select";
  state.stroke = "#c6a53a";
  state.grid = false;
  if (reset) {
    ensureDrawLayers();
    if (!state.docId) freshDoc(page?.infinite ? "Infinito" : "Foglio");
  }
  chrome();
  buildRail();
  setTool("select");
  syncPanel();
  draw();
}

function openPixelPicker() {
  state.picking = "pixel";
  chrome();
}

function openDrawPicker() {
  state.picking = "draw";
  chrome();
}

function openPixel(n, reset = true) {
  state.session = "pixel";
  state.picking = false;
  state.pixelN = n;
  if (reset) {
    if (!state.pixelLayers.length || state.pixelLayers[0].pixels.length !== n * n) {
      state.layerSeq = 1;
      state.pixelLayers = [];
      ensurePixelLayers(n);
    } else ensurePixelLayers(n);
    state.pixelHist = [state.pixelLayers.map((l) => ({ ...l, pixels: l.pixels.slice() }))];
    state.pixelHistI = 0;
    freshDoc(`Pixel ${n}`);
  } else ensurePixelLayers(n);
  state.zoom = 1;
  state.pan = { x: 0, y: 0 };
  state.tool = "pencil";
  state.grid = true;
  chrome();
  buildRail();
  setTool("pencil");
  syncPanel();
  draw();
}

async function ensure3D() {
  if (!ensure3D.factory) {
    const m = await import("./scene3d.js");
    ensure3D.factory = m.createScene3D;
  }
  return ensure3D.factory;
}

async function openModel(resetView = true) {
  state.session = "model";
  state.picking = false;
  state.tool = "select";
  state.stroke = "#c6a53a";
  if (resetView && !state.docId) freshDoc("Modello");
  chrome();
  try {
    const createScene3D = await ensure3D();
    if (!hooks.scene) {
      hooks.scene = createScene3D(view3d, {
        onChange: () => { syncPanel(); syncFnBar(); },
      });
    } else if (resetView) hooks.scene.resize();
  } catch (err) {
    console.error(err);
    toast("3D non disponibile");
  }
  buildRail();
  setTool("select");
  syncPanel();
  syncFnBar();
}

function goHome() {
  if (state.session) saveCurrentToBox();
  endTextEdit();
  state.session = null;
  state.picking = false;
  chrome();
  buildRail();
  syncPanel();
  renderBox();
}

function requestMode(m) {
  if (m === "draw") openDrawPicker();
  else if (m === "pixel") openPixelPicker();
  else if (m === "model") openModel();
}

function applyDrawSize(page, name) {
  const had = state.session === "draw";
  if (!had) {
    if (state.session) saveCurrentToBox();
    state.shapes = [];
    state.layers = [];
    state.history = [[]];
    state.histI = 0;
    state.selected = [];
    freshDoc(name || (page.infinite ? "Infinito" : "Foglio"));
    openDraw(true, page);
  } else {
    state.page = { w: page.w, h: page.h, infinite: !!page.infinite };
    state.picking = false;
    if (page.infinite) { state.zoom = 1; state.pan = { x: 0, y: 0 }; }
    chrome();
    draw();
    syncPanel();
  }
}

hooks.openBox = async (id) => {
  if (state.session) saveCurrentToBox();
  endTextEdit();
  const data = loadBoxEntry(id);
  if (!data) { toast("Foglio non trovato"); return; }
  await applyOpened(data);
  toast("Foglio aperto");
};

hooks.newSheet = () => {
  if (state.session) saveCurrentToBox();
  endTextEdit();
  state.shapes = [];
  state.layers = [];
  state.pixelLayers = [];
  state.selected = [];
  state.session = null;
  freshDoc("Foglio");
  openDrawPicker();
  renderBox();
};

const grid = $("#draw-size-grid");
if (grid && !grid.dataset.ready) {
  grid.dataset.ready = "1";
  DRAW_SIZES.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "size-card";
    b.innerHTML = `<strong>${s.name}</strong><span>${s.meta}</span><span>${s.size}</span>`;
    b.addEventListener("click", () => applyDrawSize(
      { w: s.w, h: s.h, infinite: !!s.infinite },
      s.name,
    ));
    grid.appendChild(b);
  });
}

$("#fn-bar").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-color]");
  if (chip) { applyStroke(chip.dataset.color); return; }
  const b = e.target.closest("[data-fn]");
  if (b) handleFn(b.dataset.fn, io);
});
$("#bar-color")?.addEventListener("input", (e) => applyStroke(e.target.value));
$("#brand").addEventListener("click", () => goHome());
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => requestMode(b.dataset.open)));
document.querySelectorAll("[data-px]").forEach((b) => b.addEventListener("click", () => openPixel(+b.dataset.px)));
$("#picker-cancel").addEventListener("click", () => {
  state.picking = false;
  if (!state.session) chrome();
  else { chrome(); buildRail(); }
});
$("#draw-picker-cancel")?.addEventListener("click", () => {
  state.picking = false;
  if (!state.session) chrome();
  else { chrome(); buildRail(); draw(); }
});
$("#draw-custom")?.addEventListener("click", () => {
  const w = Math.max(64, Math.min(8192, +$("#draw-cw").value || 1920));
  const h = Math.max(64, Math.min(8192, +$("#draw-ch").value || 1080));
  applyDrawSize({ w, h, infinite: false }, `${w}×${h}`);
});
$("#panel-toggle").addEventListener("click", () => togglePanel());
$("#box-toggle").addEventListener("click", () => toggleBox());
$("#side-close").addEventListener("click", () => togglePanel(false));

wrap.addEventListener("mousedown", onDown);
window.addEventListener("mousemove", onMove);
window.addEventListener("mouseup", (e) => {
  onUp(e);
});
wrap.addEventListener("dblclick", (e) => {
  if (state.tool === "polyline") finishPolyline();
});
wrap.addEventListener("wheel", (e) => {
  if (state.session === "model") {
    requestAnimationFrame(syncFnBar);
    return;
  }
  if (state.session !== "draw" && state.session !== "pixel") return;
  e.preventDefault();
  endTextEdit();
  const min = state.page?.infinite ? 0.05 : 0.2;
  state.zoom = Math.min(8, Math.max(min, state.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
  draw();
}, { passive: false });

wrap.addEventListener("dragover", (e) => {
  if (state.session !== "draw") return;
  e.preventDefault();
  wrap.classList.add("is-drop");
});
wrap.addEventListener("dragleave", () => wrap.classList.remove("is-drop"));
wrap.addEventListener("drop", (e) => {
  wrap.classList.remove("is-drop");
  if (state.session !== "draw") {
    if ([...e.dataTransfer.files].some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      toast("Trascina le immagini sul tavolo Disegno");
    }
    return;
  }
  const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  files.forEach((f) => addImageAt(f, e.clientX, e.clientY));
});

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.key === "Escape") {
    if (state.picking) {
      (state.picking === "draw" ? $("#draw-picker-cancel") : $("#picker-cancel"))?.click();
      return;
    }
    state.polyPts = []; state.drag = null; draw();
  }
  if (e.key === "Enter" && state.tool === "polyline") finishPolyline();
  if (cmdKey(e) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    handleFn(e.shiftKey ? "redo" : "undo", io);
  }
  if (cmdKey(e) && e.key.toLowerCase() === "c") {
    e.preventDefault();
    copySelection();
  }
  if (cmdKey(e) && e.key.toLowerCase() === "v") {
    e.preventDefault();
    pasteSelection();
  }
  if (e.key === "Backspace" || e.key === "Delete") {
    if (state.session === "model") act("del3"); else act("del");
  }
  if (state.session === "model" && !e.metaKey && !e.ctrlKey) {
    if (e.key.toLowerCase() === "g") setTool("move");
    if (e.key.toLowerCase() === "r") setTool("rotate");
    if (e.key.toLowerCase() === "s") setTool("scale");
    if (e.key.toLowerCase() === "f") setTool("face");
    if (e.key.toLowerCase() === "v") setTool("vertex");
  }
});

window.addEventListener("paste", (e) => {
  if (e.target.matches("input, textarea")) return;
  const items = [...(e.clipboardData?.items || [])];
  const img = items.find((it) => it.type.startsWith("image/"));
  if (!img || state.session !== "draw") return;
  const file = img.getAsFile();
  if (!file) return;
  e.preventDefault();
  const r = wrap.getBoundingClientRect();
  addImageAt(file, r.left + r.width / 2, r.top + r.height / 2);
});

new ResizeObserver(() => { draw(); hooks.scene?.resize(); }).observe(wrap);
chrome();
buildRail();
syncPanel();
renderBox();
