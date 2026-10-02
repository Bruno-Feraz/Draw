import { state, defaultPage } from "./state.js";
import { hooks } from "./hooks.js";
import { toast } from "./dom.js";
import { slimShapes, hydrateShapes, exportStamps, importStamps } from "./stamps.js";
import { upsertBox, getBox } from "./box.js";
import { canvasThumb } from "./draw2d.js";

export function projectData() {
  return {
    v: 2,
    session: state.session,
    draw: {
      shapes: slimShapes(state.shapes),
      stamps: exportStamps(),
      layers: state.layers,
      activeLayer: state.drawLayer,
      layerSeq: state.layerSeq,
      page: state.page,
    },
    pixel: {
      pixelN: state.pixelN,
      pixelLayers: state.pixelLayers,
      activeLayer: state.pixelLayer,
    },
    model: hooks.scene?.serialize() ?? null,
    docId: state.docId,
    docName: state.docName,
  };
}

export function applyProject(data) {
  if (!data || (data.v !== 1 && data.v !== 2)) throw new Error("file non valido");
  if (data.draw) {
    importStamps(data.draw.stamps);
    state.shapes = data.draw.shapes || [];
    hydrateShapes(state.shapes);
    state.layers = data.draw.layers || [];
    state.layerSeq = data.draw.layerSeq ?? 1;
    state.history = [slimShapes(state.shapes)];
    state.histI = 0;
    state.page = data.draw.page
      ? { w: data.draw.page.w || 1920, h: data.draw.page.h || 1080, infinite: !!data.draw.page.infinite }
      : defaultPage();
  }
  if (data.pixel) {
    state.pixelN = data.pixel.pixelN || 32;
    state.pixelLayers = data.pixel.pixelLayers || [];
    state.pixelHist = [state.pixelLayers.map((l) => ({
      id: l.id, name: l.name, visible: l.visible, opacity: l.opacity ?? 1, pixels: l.pixels.slice(),
    }))];
    state.pixelHistI = 0;
  }
  if (data.draw?.activeLayer) state.drawLayer = data.draw.activeLayer;
  if (data.pixel?.activeLayer) state.pixelLayer = data.pixel.activeLayer;
  if (data.docId) state.docId = data.docId;
  if (data.docName) state.docName = data.docName;
  return data;
}

export function saveCurrentToBox() {
  if (!state.session) return false;
  if (!state.docId) state.docId = crypto.randomUUID();
  if (!state.docName) state.docName = "Foglio";
  try {
    upsertBox({
      id: state.docId,
      name: state.docName,
      session: state.session,
      page: state.session === "draw" ? state.page : state.session === "pixel"
        ? { w: state.pixelN, h: state.pixelN } : null,
      thumb: canvasThumb(),
      data: projectData(),
    });
  } catch (err) {
    toast(err.message || "Box pieno");
    return false;
  }
  return true;
}

export function saveProject() {
  saveCurrentToBox();
  const blob = new Blob([JSON.stringify(projectData())], { type: "application/json" });
  const a = document.createElement("a");
  a.download = `${(state.docName || "dram").replace(/[^\w\-]+/g, "_")}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Salvato nel Box e come file");
  hooks.syncBox?.();
}

export function loadBoxEntry(id) {
  const row = getBox(id);
  if (!row?.data) return null;
  applyProject(row.data);
  state.docId = row.id;
  state.docName = row.name;
  return row.data;
}

export function openProjectFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then((txt) => {
        try { resolve(applyProject(JSON.parse(txt))); }
        catch { toast("File non valido"); resolve(null); }
      });
    });
    input.click();
  });
}
