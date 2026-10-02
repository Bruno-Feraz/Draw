import { $ } from "./dom.js";
import { toast } from "./dom.js";
import { state, makeLayer, activeLayerId, setActiveLayerId } from "./state.js";
import { ICONS, toolsFor } from "./tools.js";
import { hooks } from "./hooks.js";
import { canvas, wrap, draw, sel, selIds, bounds, pushHist, pushPixel, exportPixelPng, exportDrawPng, clearDraw, clearPixel, finishPolyline, mergeDraw, markPixelDirty, zoomFitDraw } from "./draw2d.js";
import { listBox, deleteBox, sessionLabel, pageLabel } from "./box.js";

export const appEl = $("#app");
export const view3d = $("#view3d");

function pageStatus() {
  if (state.page?.infinite) return "Infinito";
  return `${state.page.w} × ${state.page.h}`;
}

export function chrome() {
  appEl.classList.toggle("is-home", !state.session && !state.picking);
  appEl.classList.toggle("is-picker", !!state.picking);
  $("#home").hidden = !(!state.session && !state.picking);
  $("#picker").hidden = state.picking !== "pixel";
  const dp = $("#draw-picker");
  if (dp) dp.hidden = state.picking !== "draw";
  canvas.hidden = !(state.session === "draw" || state.session === "pixel") || !!state.picking;
  view3d.hidden = state.session !== "model";
  hooks.scene?.setPaused?.(state.session !== "model");
  wrap.style.cursor = state.session === "model" || ["select", "text"].includes(state.tool) ? (state.tool === "text" ? "text" : "default") : "crosshair";
  if (state.session === "draw") $("#status-size").textContent = pageStatus();
  else if (state.session === "pixel") $("#status-size").textContent = `${state.pixelN} × ${state.pixelN}`;
  else if (state.session === "model") $("#status-size").textContent = "Three.js";
  else $("#status-size").textContent = "Scegli un formato";
  if (!state.session) $("#status-tool").textContent = "Menu";
  const fw = $("#face-wheel");
  if (fw && state.session !== "model") fw.hidden = true;
  syncColorBar();
  syncFnBar();
}

export function syncFnBar() {
  const gridBtn = $("#fn-bar [data-fn=grid]");
  const snapBtn = $("#fn-bar [data-fn=snap]");
  if (state.session === "model" && hooks.scene) {
    gridBtn.classList.toggle("is-on", hooks.scene.grid);
    snapBtn.classList.toggle("is-on", hooks.scene.snap);
    $("#zoom-read").textContent = hooks.scene.zoomLabel();
  } else {
    gridBtn.classList.toggle("is-on", state.grid);
    snapBtn.classList.toggle("is-on", state.snap);
    $("#zoom-read").textContent = `${Math.round(state.zoom * 100)}%`;
  }
}

export function syncColorBar() {
  const bar = $("#color-bar");
  if (!bar) return;
  bar.hidden = !(state.session === "draw" || state.session === "pixel");
  const hex = (state.stroke || "").toLowerCase();
  bar.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("is-on", b.dataset.color.toLowerCase() === hex));
  const pick = $("#bar-color");
  if (pick) pick.value = state.stroke;
}

export function applyStroke(hex) {
  state.stroke = hex;
  const s = sel();
  if (s && state.session === "draw") { s.stroke = hex; draw(); }
  if (state.session === "model") hooks.scene?.setColor(hex);
  syncColorBar();
  const panel = $("#f-stroke");
  if (panel) {
    panel.value = hex;
    const sw = panel.closest(".swatch");
    if (sw) sw.style.background = hex;
  }
}

export function setTool(id) {
  state.tool = id;
  if (id !== "polyline") finishPolyline();
  document.querySelectorAll(".tool").forEach((b) => b.classList.toggle("is-active", b.dataset.tool === id));
  const t = toolsFor(state.session).flatMap((g) => g.items).find((x) => x.id === id);
  $("#status-tool").textContent = t?.name || id;
  wrap.style.cursor = ["select", "move", "rotate", "scale", "face", "vertex"].includes(id) || state.session === "model" ? "default" : id === "text" ? "text" : "crosshair";
  const sc = hooks.scene;
  if (state.session === "model" && sc && ["move", "rotate", "scale"].includes(id)) {
    sc.setEditMode("object");
    sc.setXform(id === "move" ? "translate" : id === "rotate" ? "rotate" : "scale");
    return;
  }
  if (state.session === "model" && sc && (id === "face" || id === "vertex")) {
    sc.setEditMode(id === "face" ? "face" : "vertex");
    return;
  }
  if (state.session === "model" && sc && id === "select") {
    sc.setEditMode("object");
    return;
  }
  if (state.session === "model" && sc && ["box", "sphere", "cylinder", "cone"].includes(id)) {
    sc.addPrimitive(id);
    setTool("select");
    syncPanel();
  }
}

export function buildRail() {
  const rail = $("#rail");
  rail.innerHTML = "";
  if (!state.session) return;
  toolsFor(state.session).forEach((g) => {
    const lab = document.createElement("div");
    lab.className = "rail-label";
    lab.textContent = g.group;
    rail.appendChild(lab);
    g.items.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tool" + (t.id === state.tool ? " is-active" : "");
      b.dataset.tool = t.id;
      b.dataset.name = t.name;
      b.innerHTML = ICONS[t.id] || ICONS.rect;
      b.addEventListener("click", () => setTool(t.id));
      rail.appendChild(b);
    });
  });
}

function acc(title, open, inner) {
  return `<section class="acc${open ? " is-open" : ""}">
    <button type="button" class="acc-h">${title}<span class="chev">›</span></button>
    <div class="acc-c">${inner}</div></section>`;
}

let lastPanelKey = "";

function panelKey() {
  const list = state.session === "draw" ? state.layers : state.session === "pixel" ? state.pixelLayers : [];
  const nSel = state.session === "model" ? (hooks.scene?.selectedCount || 0) : selIds().length;
  const mode = nSel > 1 ? "m" : nSel === 1 ? "1" : "0";
  const kind = state.session === "model" ? (hooks.scene?.selected?.userData?.type || "") : (sel()?.type || "");
  return `${state.session}|${mode}|${list.map((l) => l.id).join(",")}|${kind}`;
}

export function syncPanel() {
  bindPanelOnce();
  const key = panelKey();
  if (key !== lastPanelKey) {
    lastPanelKey = key;
    renderPanelFull();
    return;
  }
  patchPanel();
}

function patchPanel() {
  const body = $("#side-body");
  const focused = document.activeElement;
  const objs = body.querySelector("[data-doc-objects]");
  if (objs) objs.value = String(state.shapes.length);
  const solids = body.querySelector("[data-doc-solids]");
  if (solids) solids.value = String(hooks.scene?.count ?? 0);
  const aid = activeLayerId();
  const list = state.session === "pixel" ? state.pixelLayers : state.layers;
  body.querySelectorAll(".layer-row").forEach((row) => {
    row.classList.toggle("is-on", +row.dataset.layer === aid);
  });
  body.querySelectorAll("[data-vis]").forEach((b) => {
    const L = list.find((l) => l.id === +b.dataset.vis);
    if (L) b.textContent = L.visible ? "●" : "○";
  });
  const s = sel();
  if (s && focused?.id !== "f-x") {
    const x = body.querySelector("#f-x");
    if (x) x.value = String(Math.round(s.x ?? bounds(s).x));
  }
  if (s && focused?.id !== "f-y") {
    const y = body.querySelector("#f-y");
    if (y) y.value = String(Math.round(s.y ?? bounds(s).y));
  }
  if (s && focused?.id !== "f-w") {
    const w = body.querySelector("#f-w");
    if (w) w.value = String(Math.round(s.w ?? bounds(s).w));
  }
  if (s && focused?.id !== "f-h") {
    const h = body.querySelector("#f-h");
    if (h) h.value = String(Math.round(s.h ?? bounds(s).h));
  }
}

function renderPanelFull() {
  const s = sel();
  const sc = hooks.scene;
  const body = $("#side-body");
  const fmt = !state.session
    ? `<p class="hint">Nessun tavolo aperto. Scegli Disegno, Pixel o 3D.</p>`
    : state.session === "draw"
      ? `<div class="row"><label>Nome</label><input id="f-name" type="text" value="${state.docName || "Foglio"}" /></div>
         <div class="row"><label>Formato</label><input type="text" readonly value="${pageStatus()}" /></div>
         <div class="row"><label>Oggetti</label><input type="text" readonly data-doc-objects value="${state.shapes.length}" /></div>
         <div class="btns"><button class="btn full" data-act="resize-page">Cambia misura</button></div>`
      : state.session === "pixel"
        ? `<div class="row"><label>Formato</label><input type="text" readonly value="${state.pixelN} × ${state.pixelN}" /></div>
           <div class="btns"><button class="btn full" data-act="resize-px">Cambia misura</button></div>`
        : `<div class="row"><label>Motore</label><input type="text" readonly value="Three.js" /></div>
           <div class="row"><label>Solidi</label><input type="text" readonly data-doc-solids value="${sc?.count ?? 0}" /></div>
           <p class="hint">Faccia: ruota in basso (min = angoli sulla sagoma). Angoli: avvicinali per lo snap. ⌘+clic: più solidi, poi Unisci.</p>`;

  const nSel = selIds().length;
  const obj = state.session === "model"
    ? (sc?.selected
      ? `<p class="hint">${sc.selectedCount > 1 ? sc.selectedCount + " solidi" : "Solido " + sc.selected.userData.type}. Colore dal tratto. ⌘+clic per aggiungerne.</p>
         <div class="btns"><button class="btn" data-act="del3">Elimina</button></div>`
      : `<p class="hint">Clicca un oggetto. ⌘+clic per selezionarne più d’uno.</p>`)
    : nSel
      ? (nSel > 1
        ? `<p class="hint">${nSel} forme selezionate. Unisci / sottrai dal pannello Merge.</p>
           <div class="btns"><button class="btn" data-act="del">Elimina</button></div>`
        : `
        <div class="row"><label>Tipo</label><input type="text" readonly value="${s.type}" /></div>
        <div class="row"><label>X</label><input id="f-x" type="number" value="${Math.round(s.x ?? bounds(s).x)}" /></div>
        <div class="row"><label>Y</label><input id="f-y" type="number" value="${Math.round(s.y ?? bounds(s).y)}" /></div>
        <div class="row"><label>L</label><input id="f-w" type="number" value="${Math.round(s.w ?? bounds(s).w)}" /></div>
        <div class="row"><label>H</label><input id="f-h" type="number" value="${Math.round(s.h ?? bounds(s).h)}" /></div>
        ${s.type === "text" ? `<div class="row"><label>Testo</label><input id="f-text" type="text" value="${(s.text || "").replace(/"/g, "&quot;")}" /></div>
        <div class="row"><label>Corpo</label><input id="f-fontsize" type="number" min="8" max="240" value="${Math.round(s.fontSize || 28)}" /></div>` : ""}
        <div class="row"><label>°</label><input id="f-rot" type="number" value="${Math.round(((s.rot || 0) * 180) / Math.PI)}" /></div>
        <div class="btns"><button class="btn" data-act="dup">Duplica</button><button class="btn" data-act="del">Elimina</button></div>`)
      : `<p class="hint">Seleziona. ⌘+clic per più forme. Trascina il foglio vuoto per spostarlo.</p>`;

  const layerList = (state.session === "draw" ? state.layers : state.session === "pixel" ? state.pixelLayers : [])
    .slice()
    .reverse()
    .map((l) => `
      <div class="layer-row${l.id === activeLayerId() ? " is-on" : ""}" data-layer="${l.id}">
        <button type="button" class="layer-vis" data-vis="${l.id}" title="Visibile">${l.visible ? "●" : "○"}</button>
        <button type="button" class="layer-name" data-pick="${l.id}">${l.name}</button>
        <input class="layer-op" type="range" min="0" max="100" value="${Math.round((l.opacity ?? 1) * 100)}" data-opacity="${l.id}" title="Opacità" />
        <button type="button" class="layer-del" data-del-layer="${l.id}" title="Elimina livello">✕</button>
      </div>`).join("");

  const layersAcc = (state.session === "draw" || state.session === "pixel")
    ? acc("Livelli", true, `
        <div class="layer-list">${layerList || "<p class='hint'>Nessun livello</p>"}</div>
        <div class="btns" style="margin-top:8px">
          <button class="btn primary full" data-act="add-layer">+ Livello</button>
        </div>`)
    : "";

  body.innerHTML = [
    acc("Documento", true, fmt),
    layersAcc,
    acc("Oggetto", true, obj),
    acc("Tratto", true, `
      <div class="row"><label>Colore</label><div class="swatch-row">
        <label class="swatch" style="background:${state.stroke}"><input id="f-stroke" type="color" value="${state.stroke}" /></label>
      </div></div>
      <div class="row"><label>Spessore</label><input id="f-width" type="number" min="1" max="40" value="${state.width}" /></div>
      <div class="row"><label>Stile</label><select id="f-dash">
        <option value="solid"${state.dash === "solid" ? " selected" : ""}>Continuo</option>
        <option value="dash"${state.dash === "dash" ? " selected" : ""}>Tratteggiato</option>
        <option value="dot"${state.dash === "dot" ? " selected" : ""}>Puntinato</option>
      </select></div>`),
    acc("Riempimento", state.session === "draw", `
      <div class="row"><label>Colore</label><div class="swatch-row">
        <label class="swatch" style="background:${state.fill === "#00000000" ? "#111" : state.fill}"><input id="f-fill" type="color" value="${state.fill === "#00000000" ? "#1a1a1a" : state.fill}" /></label>
      </div></div>
      <div class="btns"><button class="btn full" data-act="nofill">Nessun riempimento</button></div>`),
    acc("Merge", state.session === "draw" || state.session === "model", `
      <p class="hint">${state.session === "model"
        ? "⌘+clic: prima il solido da togliere, poi quello che resta. Es. cilindro, poi cubo → cubo forato."
        : "⌘+clic su più forme, poi Unisci. Il secchiello riempie i buchi interni."}</p>
      <div class="btns">
        <button type="button" class="btn primary" data-act="union">Unisci</button>
        <button type="button" class="btn" data-act="sub">Sottrai</button>
        <button type="button" class="btn" data-act="inter">Interseca</button>
        <button type="button" class="btn" data-act="split">Spezza</button>
      </div>`),
    acc("Esporta", false, `
      <div class="btns">
        <button class="btn primary" data-act="png">PNG</button>
        <button class="btn" data-act="svg">SVG</button>
        <button class="btn full" data-act="glb">GLB</button>
      </div>`),
  ].join("");

  bindPanelOnce();
}

function bindPanelOnce() {
  const body = $("#side-body");
  if (body.dataset.bound) return;
  body.dataset.bound = "1";
  body.addEventListener("click", (e) => {
    const h = e.target.closest(".acc-h");
    if (h && body.contains(h)) {
      h.parentElement.classList.toggle("is-open");
      return;
    }
    const pick = e.target.closest("[data-pick]");
    if (pick) {
      setActiveLayerId(+pick.dataset.pick);
      if (state.session === "pixel") {
        const L = state.pixelLayers.find((l) => l.id === activeLayerId());
        if (L) state.pixels = L.pixels;
      }
      syncPanel();
      return;
    }
    const vis = e.target.closest("[data-vis]");
    if (vis) {
      e.stopPropagation();
      const id = +vis.dataset.vis;
      const list = state.session === "pixel" ? state.pixelLayers : state.layers;
      const L = list.find((l) => l.id === id);
      if (L) L.visible = !L.visible;
      markPixelDirty();
      draw();
      syncPanel();
      return;
    }
    const delL = e.target.closest("[data-del-layer]");
    if (delL) {
      e.stopPropagation();
      deleteLayer(+delL.dataset.delLayer);
      return;
    }
    const actEl = e.target.closest("[data-act]");
    if (actEl) act(actEl.dataset.act);
  });
  body.addEventListener("input", (e) => {
    const t = e.target;
    const s = sel();
    if (t.matches("[data-opacity]")) {
      const id = +t.dataset.opacity;
      const list = state.session === "pixel" ? state.pixelLayers : state.layers;
      const L = list.find((l) => l.id === id);
      if (L) L.opacity = (+t.value) / 100;
      markPixelDirty();
      draw();
      return;
    }
    if (t.id === "f-stroke") applyStroke(t.value);
    if (t.id === "f-fill") { state.fill = t.value; if (s) { s.fill = state.fill; draw(); } }
    if (t.id === "f-width") { state.width = +t.value || 1; if (s) { s.width = state.width; draw(); } }
    if (t.id === "f-dash") { state.dash = t.value; if (s) { s.dash = state.dash; draw(); } }
    if (t.id === "f-x" && s) { s.x = +t.value; draw(); }
    if (t.id === "f-y" && s) { s.y = +t.value; draw(); }
    if (t.id === "f-w" && s) { s.w = +t.value; draw(); }
    if (t.id === "f-h" && s) { s.h = +t.value; draw(); }
    if (t.id === "f-rot" && s) { s.rot = (+t.value * Math.PI) / 180; draw(); }
    if (t.id === "f-name") { state.docName = t.value; }
    if (t.id === "f-text" && s?.type === "text") { s.text = t.value; draw(); }
    if (t.id === "f-fontsize" && s?.type === "text") { s.fontSize = +t.value || 28; s.h = s.fontSize * 1.4; draw(); }
  });
}

function deleteLayer(id) {
  if (state.session === "draw") {
    if (state.layers.length <= 1) { toast("Serve almeno un livello"); return; }
    state.shapes = state.shapes.filter((s) => (s.layerId ?? state.layers[0]?.id) !== id);
    state.layers = state.layers.filter((l) => l.id !== id);
    if (state.drawLayer === id) {
      setActiveLayerId(state.layers[state.layers.length - 1].id);
    }
    state.selected = [];
    pushHist();
  } else if (state.session === "pixel") {
    if (state.pixelLayers.length <= 1) { toast("Serve almeno un livello"); return; }
    state.pixelLayers = state.pixelLayers.filter((l) => l.id !== id);
    if (state.pixelLayer === id) {
      const L = state.pixelLayers[state.pixelLayers.length - 1];
      setActiveLayerId(L.id);
      state.pixels = L.pixels;
    } else {
      const cur = state.pixelLayers.find((l) => l.id === state.pixelLayer);
      if (cur) state.pixels = cur.pixels;
    }
    pushPixel();
  }
  draw();
  syncPanel();
}

export function act(id) {
  const s = sel();
  if (id === "add-layer") {
    if (state.session === "draw") {
      const l = makeLayer(`Livello ${state.layers.length + 1}`);
      state.layers.push(l);
      setActiveLayerId(l.id);
    } else if (state.session === "pixel") {
      const l = makeLayer(`Livello ${state.pixelLayers.length + 1}`);
      l.pixels = new Array(state.pixelN * state.pixelN).fill(null);
      state.pixelLayers.push(l);
      setActiveLayerId(l.id);
      state.pixels = l.pixels;
      markPixelDirty();
    }
    syncPanel();
    return;
  }
  if (id === "resize-px") { state.picking = "pixel"; chrome(); return; }
  if (id === "resize-page") { state.picking = "draw"; chrome(); return; }
  if (id === "del3") { hooks.scene?.removeSelected(); syncPanel(); return; }
  if (id === "dup" && s) {
    const n = structuredClone(s);
    n.x = (n.x || 0) + 16; n.y = (n.y || 0) + 16;
    if (n.pts) n.pts = n.pts.map((p) => ({ x: p.x + 16, y: p.y + 16 }));
    state.shapes.push(n); state.selected = [state.shapes.length - 1]; pushHist(); draw(); syncPanel(); return;
  }
  if (id === "del") {
    const ids = selIds().sort((a, b) => b - a);
    if (!ids.length) return;
    ids.forEach((i) => state.shapes.splice(i, 1));
    state.selected = [];
    pushHist(); draw(); syncPanel(); return;
  }
  if (id === "nofill") { state.fill = "#00000000"; if (s) s.fill = state.fill; draw(); syncPanel(); return; }
  if (["union", "sub", "inter", "split"].includes(id)) {
    if (state.session === "draw") {
      Promise.resolve(mergeDraw(id)).then(() => syncPanel());
      return;
    }
    const r = hooks.scene?.mergeSelected(id);
    if (r === "need") toast("⌘+clic: prima il pezzo da togliere, poi il solido che resta");
    else if (r === "empty") toast("Niente da unire: sposta i solidi così si toccano");
    else if (r === "soon") toast("Operazione non disponibile");
    else if (r === "split") toast("Spezza: unisci prima due solidi");
    else if (r === "split-ok") toast("Spezzato");
    else if (r === "ok") toast(id === "sub" ? "Sottratto" : id === "inter" ? "Intersecato" : "Uniti");
    syncPanel();
    return;
  }
  if (id === "png") {
    if (state.session === "pixel") exportPixelPng();
    else if (state.session === "draw") {
      Promise.resolve(exportDrawPng());
    } else if (state.session === "model") hooks.scene?.exportPng();
    return;
  }
  if (id === "svg") toast("Export SVG in arrivo");
  if (id === "glb") toast("Export GLB in arrivo");
}

export function togglePanel(on) {
  if (state.sideView === "box") {
    state.sideView = "fn";
    state.panel = on ?? true;
  } else {
    state.panel = on ?? !state.panel;
    state.sideView = "fn";
  }
  applySide();
}

export function toggleBox(on) {
  const open = on ?? (state.sideView !== "box" || !state.panel);
  state.panel = !!open;
  state.sideView = open ? "box" : "fn";
  if (open) {
    hooks.stashBox?.();
    renderBox();
  }
  applySide();
}

function applySide() {
  $("#side").classList.toggle("is-collapsed", !state.panel);
  $("#panel-toggle").classList.toggle("is-on", state.panel && state.sideView === "fn");
  $("#box-toggle")?.classList.toggle("is-on", state.panel && state.sideView === "box");
  $("#side-body").hidden = state.sideView === "box";
  const bb = $("#box-body");
  if (bb) bb.hidden = state.sideView !== "box";
  const title = $("#side-title");
  if (title) title.textContent = state.sideView === "box" ? "Box" : "Funzioni";
  requestAnimationFrame(() => { draw(); hooks.scene?.resize(); });
}

export function renderBox() {
  const body = $("#box-body");
  if (!body) return;
  const rows = listBox();
  body.innerHTML = `
    <p class="hint" style="padding:10px 14px 0">Fogli salvati su questo Mac. Salva per aggiungerli.</p>
    <div class="btns" style="padding:8px 14px">
      <button type="button" class="btn primary full" data-box-new>Nuovo foglio</button>
    </div>
    <div class="box-list">
      ${rows.length ? rows.map((r) => `
        <div class="box-item${r.id === state.docId ? " is-on" : ""}" data-box-open="${r.id}">
          <div class="box-thumb">${r.thumb ? `<img src="${r.thumb}" alt="" />` : ""}</div>
          <div class="box-meta">
            <strong>${r.name || "Foglio"}</strong>
            <span>${sessionLabel(r.session)}${pageLabel(r.page, r.session) ? " · " + pageLabel(r.page, r.session) : ""}</span>
          </div>
          <button type="button" class="icon-btn" data-box-del="${r.id}" title="Elimina">✕</button>
        </div>`).join("") : `<p class="hint" style="padding:8px 14px">Nessun foglio ancora.</p>`}
    </div>`;
  if (!body.dataset.bound) {
    body.dataset.bound = "1";
    body.addEventListener("click", (e) => {
      if (e.target.closest("[data-box-new]")) {
        hooks.newSheet?.();
        return;
      }
      const del = e.target.closest("[data-box-del]");
      if (del) {
        e.stopPropagation();
        deleteBox(del.dataset.boxDel);
        if (state.docId === del.dataset.boxDel) state.docId = crypto.randomUUID();
        renderBox();
        return;
      }
      const open = e.target.closest("[data-box-open]");
      if (open) hooks.openBox?.(open.dataset.boxOpen);
    });
  }
}

hooks.syncBox = renderBox;

export function handleFn(id, io) {
  const sc = hooks.scene;
  if (id === "new") {
    if (state.session === "model") { sc?.reset(); syncPanel(); syncFnBar(); return; }
    if (state.session === "draw") { clearDraw(); draw(); syncPanel(); return; }
    if (state.session === "pixel") { clearPixel(); draw(); syncPanel(); return; }
    return;
  }
  if (id === "open") io.open();
  if (id === "save") io.save();
  if (id === "undo") {
    if (state.session === "model") sc?.undo();
    else io.undo2d();
    return;
  }
  if (id === "redo") {
    if (state.session === "model") sc?.redo();
    else io.redo2d();
    return;
  }
  if (id === "grid") {
    if (state.session === "model") sc?.setGrid(!sc.grid);
    else {
      state.grid = !state.grid;
      draw();
    }
    syncFnBar();
    return;
  }
  if (id === "snap") {
    if (state.session === "model") sc?.setSnap(!sc.snap);
    else state.snap = !state.snap;
    syncFnBar();
    return;
  }
  if (id === "zoom-in") {
    if (state.session === "model") sc?.zoomBy(0.82);
    else { state.zoom = Math.min(8, state.zoom * 1.2); draw(); }
    syncFnBar();
    return;
  }
  if (id === "zoom-out") {
    if (state.session === "model") sc?.zoomBy(1.22);
    else { state.zoom = Math.max(0.2, state.zoom / 1.2); draw(); }
    syncFnBar();
    return;
  }
  if (id === "zoom-fit") {
    if (state.session === "model") sc?.zoomFit();
    else zoomFitDraw();
    syncFnBar();
    return;
  }
  if (id === "export") act("png");
}

function tipEl() {
  let t = $("#float-tip");
  if (!t) {
    t = document.createElement("div");
    t.id = "float-tip";
    t.className = "float-tip";
    t.hidden = true;
    document.body.appendChild(t);
  }
  return t;
}

const rail = $("#rail");
rail.addEventListener("mousemove", (e) => {
  const b = e.target.closest(".tool");
  const t = tipEl();
  if (!b) { t.hidden = true; return; }
  t.hidden = false;
  t.textContent = b.dataset.name || "";
  const x = e.clientX + 14;
  const y = e.clientY + 10;
  t.style.left = `${Math.min(x, innerWidth - t.offsetWidth - 8)}px`;
  t.style.top = `${Math.min(y, innerHeight - t.offsetHeight - 8)}px`;
});
rail.addEventListener("mouseleave", () => { tipEl().hidden = true; });

