import { state, activeLayerId } from "./state.js";
import { selIds, draw, pushHist } from "./draw2d.js";
import { hooks } from "./hooks.js";
import { toast } from "./dom.js";

let clip = null;

export function copySelection() {
  if (state.session === "draw") {
    const ids = selIds();
    if (!ids.length) { toast("Niente da copiare"); return; }
    clip = { kind: "draw", data: ids.map((i) => structuredClone(state.shapes[i])) };
    toast("Copiato");
    return;
  }
  if (state.session === "model") {
    const data = hooks.scene?.copySelected?.();
    if (!data?.length) { toast("Niente da copiare"); return; }
    clip = { kind: "model", data };
    toast("Copiato");
  }
}

export function pasteSelection() {
  if (!clip) { toast("Appunti vuoti"); return; }
  if (state.session === "draw" && clip.kind === "draw") {
    const start = state.shapes.length;
    const copies = clip.data.map((s) => {
      const n = structuredClone(s);
      n.x = (n.x || 0) + 16;
      n.y = (n.y || 0) + 16;
      if (n.pts) n.pts = n.pts.map((p) => ({ x: p.x + 16, y: p.y + 16 }));
      n.layerId = activeLayerId();
      return n;
    });
    clip.data = copies.map((s) => structuredClone(s));
    copies.forEach((n) => state.shapes.push(n));
    state.selected = copies.map((_, i) => start + i);
    pushHist();
    draw();
    hooks.syncPanel();
    toast("Incollato");
    return;
  }
  if (state.session === "model" && clip.kind === "model") {
    const copies = clip.data.map((it) => {
      const n = structuredClone(it);
      n.position = n.position.slice();
      n.position[0] += 1.4;
      return n;
    });
    clip.data = copies.map((s) => structuredClone(s));
    hooks.scene?.pasteItems(copies);
    toast("Incollato");
  }
}
