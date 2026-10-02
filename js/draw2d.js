import { $, toast } from "./dom.js";
import { state, DRAW_W, DRAW_H, activeLayerId } from "./state.js";
import { hooks } from "./hooks.js";
import { multiKey } from "./keys.js";
import { capHist } from "./hist.js";
import { internStamp, stampSrc, stampImgs, slimShapes, usedStampIds, pruneStamps, ensureStampImg } from "./stamps.js";

export const canvas = $("#view");
export const wrap = $("#canvas-wrap");
export const ctx = canvas.getContext("2d");

export function selIds() {
  const s = state.selected;
  if (Array.isArray(s)) return s.filter((i) => state.shapes[i]);
  return s == null ? [] : [s];
}

export function primaryId() {
  const ids = selIds();
  return ids.length ? ids[ids.length - 1] : null;
}


function visibleShapes() {
  const vis = new Set(state.layers.filter((l) => l.visible).map((l) => l.id));
  return state.shapes.map((s, i) => ({ s, i })).filter(({ s }) => vis.has(s.layerId ?? state.layers[0]?.id));
}

export function pushHist() {
  state.history = state.history.slice(0, state.histI + 1);
  state.history.push(slimShapes(state.shapes));
  const cap = capHist(state.history, state.history.length - 1);
  state.history = cap.list;
  state.histI = cap.index;
  pruneStamps(usedStampIds([state.shapes, ...state.history]));
}

export function pushPixel() {
  state.pixelHist = state.pixelHist.slice(0, state.pixelHistI + 1);
  state.pixelHist.push(state.pixelLayers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity ?? 1, pixels: l.pixels.slice() })));
  const cap = capHist(state.pixelHist, state.pixelHist.length - 1);
  state.pixelHist = cap.list;
  state.pixelHistI = cap.index;
}

function restorePixel(snap) {
  state.pixelLayers = snap.map((l) => ({ ...l, pixels: l.pixels.slice() }));
  const cur = state.pixelLayers.find((l) => l.id === state.pixelLayer) || state.pixelLayers[0];
  state.pixels = cur.pixels;
  state.pixelLayer = cur.id;
  markPixelDirty();
}

export function undo() {
  if (state.session === "pixel") {
    if (state.pixelHistI <= 0) return;
    state.pixelHistI--;
    restorePixel(state.pixelHist[state.pixelHistI]);
    draw();
    hooks.syncPanel();
    return;
  }
  if (state.histI <= 0) return;
  state.histI--;
  state.shapes = structuredClone(state.history[state.histI]);
  state.selected = [];
  draw();
  hooks.syncPanel();
}

export function redo() {
  if (state.session === "pixel") {
    if (state.pixelHistI >= state.pixelHist.length - 1) return;
    state.pixelHistI++;
    restorePixel(state.pixelHist[state.pixelHistI]);
    draw();
    hooks.syncPanel();
    return;
  }
  if (state.histI >= state.history.length - 1) return;
  state.histI++;
  state.shapes = structuredClone(state.history[state.histI]);
  state.selected = [];
  draw();
  hooks.syncPanel();
}

export function layout() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const pad = 48;
  if (state.session === "pixel") {
    const dw = state.pixelN, dh = state.pixelN;
    const fit = Math.min((w - pad * 2) / dw, (h - pad * 2) / dh);
    const s = fit * state.zoom;
    return { s, ox: (w - dw * s) / 2 + state.pan.x, oy: (h - dh * s) / 2 + state.pan.y, dw, dh, w, h };
  }
  if (state.page?.infinite) {
    const s = state.zoom;
    return { s, ox: w / 2 + state.pan.x, oy: h / 2 + state.pan.y, dw: 0, dh: 0, w, h, infinite: true };
  }
  const dw = state.page.w || DRAW_W, dh = state.page.h || DRAW_H;
  const fit = Math.min((w - pad * 2) / dw, (h - pad * 2) / dh);
  const s = fit * state.zoom;
  return {
    s,
    ox: (w - dw * s) / 2 + state.pan.x,
    oy: (h - dh * s) / 2 + state.pan.y,
    dw, dh, w, h,
  };
}

function snap(v) {
  if (state.session === "pixel") return Math.floor(v);
  if (!state.snap) return v;
  return Math.round(v / 16) * 16;
}

function world(e) {
  const r = wrap.getBoundingClientRect();
  const L = layout();
  const x = (e.clientX - r.left - L.ox) / L.s;
  const y = (e.clientY - r.top - L.oy) / L.s;
  return { x: snap(x), y: snap(y), rawX: x, rawY: y };
}

function hit(p) {
  const vis = visibleShapes();
  for (let k = vis.length - 1; k >= 0; k--) {
    const { s, i } = vis[k];
    const loc = toLocal(p, s);
    const b = bounds(s);
    if (loc.x >= b.x && loc.x <= b.x + b.w && loc.y >= b.y && loc.y <= b.y + b.h) return i;
  }
  return null;
}

function centerOf(s) {
  const b = bounds(s);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function toLocal(p, s) {
  const c = centerOf(s);
  const r = -(s.rot || 0);
  const dx = p.rawX - c.x, dy = p.rawY - c.y;
  return {
    x: c.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: c.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

function rotPt(x, y, s) {
  const c = centerOf(s);
  const r = s.rot || 0;
  const dx = x - c.x, dy = y - c.y;
  return {
    x: c.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: c.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

function handlePts(s) {
  const b = bounds(s);
  return {
    nw: rotPt(b.x, b.y, s),
    ne: rotPt(b.x + b.w, b.y, s),
    sw: rotPt(b.x, b.y + b.h, s),
    se: rotPt(b.x + b.w, b.y + b.h, s),
    rot: rotPt(b.x + b.w / 2, b.y - 28, s),
  };
}

function near(a, p, d = 10) {
  return Math.hypot(a.x - p.rawX, a.y - p.rawY) < d;
}

export function bounds(s) {
  if (s.type === "stamp" || s.type === "text") return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.type === "compound" && s.kids?.length) {
    const bs = s.kids.map(bounds);
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return {
      x, y,
      w: Math.max(...bs.map((b) => b.x + b.w)) - x,
      h: Math.max(...bs.map((b) => b.y + b.h)) - y,
    };
  }
  if (s.pts) {
    const xs = s.pts.map((p) => p.x), ys = s.pts.map((p) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 };
  }
  return {
    x: Math.min(s.x, s.x + (s.w || 0)),
    y: Math.min(s.y, s.y + (s.h || 0)),
    w: Math.abs(s.w || 0),
    h: Math.abs(s.h || 0),
  };
}

function style(s, c = ctx, viewScale = layout().s) {
  c.strokeStyle = s.stroke;
  c.fillStyle = s.fill && s.fill !== "#00000000" ? s.fill : "transparent";
  c.lineWidth = s.width / Math.max(viewScale, 0.001);
  c.setLineDash(s.dash === "dash" ? [8, 5] : s.dash === "dot" ? [2, 4] : []);
  c.lineCap = "round";
  c.lineJoin = "round";
}

function zigzagPts(s) {
  const a = { x: s.x, y: s.y }, b = { x: s.x + s.w, y: s.y + s.h };
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const teeth = s.teeth || 8;
  const amp = s.amp ?? len * 0.12;
  const pts = [{ ...a }];
  for (let i = 1; i < teeth; i++) {
    const t = i / teeth;
    const sign = i % 2 ? 1 : -1;
    pts.push({ x: a.x + dx * t + px * amp * sign, y: a.y + dy * t + py * amp * sign });
  }
  pts.push({ ...b });
  return pts;
}

function pathShape(s, c = ctx) {
  c.beginPath();
  if (s.type === "line") { c.moveTo(s.x, s.y); c.lineTo(s.x + s.w, s.y + s.h); }
  else if (s.type === "rect" || s.type === "round") {
    const r = s.type === "round" ? Math.min(12, Math.abs(s.w) / 4, Math.abs(s.h) / 4) : 0;
    c.roundRect(s.x, s.y, s.w, s.h, r);
  } else if (s.type === "ellipse" || s.type === "compass") {
    c.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
  } else if (s.type === "arc") {
    c.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, Math.PI * 0.15, Math.PI * 1.15);
  } else if (s.type === "triangle") {
    c.moveTo(s.x + s.w / 2, s.y); c.lineTo(s.x + s.w, s.y + s.h); c.lineTo(s.x, s.y + s.h); c.closePath();
  } else if (s.type === "poly") {
    const n = s.sides || 6, cx = s.x + s.w / 2, cy = s.y + s.h / 2, rx = Math.abs(s.w / 2), ry = Math.abs(s.h / 2);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      (i ? c.lineTo : c.moveTo).call(c, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    c.closePath();
  } else if (s.type === "star") {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2, rx = Math.abs(s.w / 2), ry = Math.abs(s.h / 2);
    for (let i = 0; i < 10; i++) {
      const f = i % 2 ? 0.42 : 1, a = (Math.PI * i) / 5 - Math.PI / 2;
      (i ? c.lineTo : c.moveTo).call(c, cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f);
    }
    c.closePath();
  } else if (s.type === "arrow") {
    c.moveTo(s.x, s.y + s.h / 2); c.lineTo(s.x + s.w * 0.72, s.y + s.h / 2);
    c.moveTo(s.x + s.w * 0.72, s.y); c.lineTo(s.x + s.w, s.y + s.h / 2); c.lineTo(s.x + s.w * 0.72, s.y + s.h);
  } else if (s.type === "zigzag") {
    const z = zigzagPts(s);
    c.moveTo(z[0].x, z[0].y);
    z.forEach((pt, i) => i && c.lineTo(pt.x, pt.y));
  } else if (s.type === "curve" && s.pts?.length >= 2) {
    c.moveTo(s.pts[0].x, s.pts[0].y);
    if (s.pts.length === 2) c.lineTo(s.pts[1].x, s.pts[1].y);
    else if (s.pts.length === 3) c.quadraticCurveTo(s.pts[1].x, s.pts[1].y, s.pts[2].x, s.pts[2].y);
    else c.bezierCurveTo(s.pts[1].x, s.pts[1].y, s.pts[2].x, s.pts[2].y, s.pts[3].x, s.pts[3].y);
  } else if (s.pts) {
    c.moveTo(s.pts[0].x, s.pts[0].y);
    s.pts.forEach((p, i) => i && c.lineTo(p.x, p.y));
    if (s.closed) c.closePath();
  }
}

function hexRgba(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function floodFillData(data, w, h, x, y, rgba) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const i0 = (y * w + x) * 4;
  const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
  if (tr === rgba[0] && tg === rgba[1] && tb === rgba[2] && ta === rgba[3]) return false;
  const same = (i) => data[i] === tr && data[i + 1] === tg && data[i + 2] === tb && data[i + 3] === ta;
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const i = (cy * w + cx) * 4;
    if (!same(i)) continue;
    data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3];
    q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return true;
}

function fillStamp(s, wx, wy, hex) {
  const run = (image) => {
    const c = document.createElement("canvas");
    c.width = image.naturalWidth || Math.max(1, Math.round(s.w));
    c.height = image.naturalHeight || Math.max(1, Math.round(s.h));
    const g = c.getContext("2d");
    g.drawImage(image, 0, 0, c.width, c.height);
    const px = Math.max(0, Math.min(c.width - 1, Math.floor((wx - s.x) / Math.max(s.w, 1) * c.width)));
    const py = Math.max(0, Math.min(c.height - 1, Math.floor((wy - s.y) / Math.max(s.h, 1) * c.height)));
    const id = g.getImageData(0, 0, c.width, c.height);
    if (!floodFillData(id.data, c.width, c.height, px, py, hexRgba(hex))) return;
    g.putImageData(id, 0, 0);
    const prev = s.stampId;
    s.stampId = internStamp(c.toDataURL());
    delete s.src;
    if (prev != null && prev !== s.stampId) stampImgs.delete(prev);
    pushHist();
    draw();
  };
  const cached = stampImgs.get(s.stampId);
  if (cached?.complete && cached.naturalWidth) { run(cached); return; }
  ensureStampImg(s).then((im) => { if (im) run(im); });
}

function wrapLines(c, text, maxW) {
  const raw = (text || "").split("\n");
  const out = [];
  for (const para of raw) {
    if (!para) { out.push(""); continue; }
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (maxW > 8 && c.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

function paintText(s, c) {
  const size = s.fontSize || 28;
  c.font = `${size}px "IBM Plex Sans", "Helvetica Neue", sans-serif`;
  c.textBaseline = "top";
  c.fillStyle = s.fill && s.fill !== "#00000000" ? s.fill : (s.stroke || "#c6a53a");
  const lines = wrapLines(c, s.text || "", Math.max(8, s.w));
  const lh = size * 1.25;
  lines.forEach((line, i) => c.fillText(line, s.x, s.y + i * lh));
}

function paintShape(s, c = ctx, viewScale = layout().s) {
  if (s.type === "text") {
    if (editingI >= 0 && state.shapes[editingI] === s) return;
    const cen = centerOf(s);
    c.save();
    c.translate(cen.x, cen.y);
    c.rotate(s.rot || 0);
    c.translate(-cen.x, -cen.y);
    paintText(s, c);
    c.restore();
    return;
  }
  if (s.type === "stamp") {
    const img = stampImgs.get(s.stampId);
    if (img?.complete && img.naturalWidth) c.drawImage(img, s.x, s.y, s.w, s.h);
    else {
      const src = stampSrc(s);
      if (!src) return;
      if (!stampImgs.has(s.stampId)) {
        const im = new Image();
        im.src = src;
        im.onload = () => draw();
        stampImgs.set(s.stampId, im);
      }
    }
    return;
  }
  if (s.type === "compound") {
    s.kids?.forEach((k) => paintShape(k, c, viewScale));
    return;
  }
  const cen = centerOf(s);
  c.save();
  c.translate(cen.x, cen.y);
  c.rotate(s.rot || 0);
  c.translate(-cen.x, -cen.y);
  style(s, c, viewScale);
  pathShape(s, c);
  if (s.fill && s.fill !== "#00000000") c.fill();
  c.stroke();
  c.restore();
}

function applyPage() {
  const dpr = devicePixelRatio || 1;
  const L = layout();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(L.ox, L.oy);
  ctx.scale(L.s, L.s);
  return L;
}

export function markPixelDirty() { pxDirty = true; }

let pxCache = null;
let pxDirty = true;
const hexRgbMemo = new Map();

function hexRgb(hex) {
  let c = hexRgbMemo.get(hex);
  if (c) return c;
  let h = (hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexRgbMemo.set(hex, c);
  return c;
}

function pixelSheet() {
  const n = state.pixelN;
  if (!pxCache || pxCache.n !== n) {
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    pxCache = { n, c, g: c.getContext("2d") };
    pxDirty = true;
  }
  if (!pxDirty) return pxCache.c;
  const id = pxCache.g.createImageData(n, n);
  const data = id.data;
  const layers = state.pixelLayers;
  for (let i = 0; i < n * n; i++) {
    const checker = ((i % n) + ((i / n) | 0)) % 2;
    let r = checker ? 236 : 255, g = r, b = r;
    for (const layer of layers) {
      if (!layer.visible) continue;
      const col = layer.pixels[i];
      if (!col) continue;
      const a = layer.opacity ?? 1;
      const [sr, sg, sb] = hexRgb(col);
      r += (sr - r) * a;
      g += (sg - g) * a;
      b += (sb - b) * a;
    }
    const o = i * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  pxCache.g.putImageData(id, 0, 0);
  pxDirty = false;
  return pxCache.c;
}

export function draw() {
  if (state.session !== "draw" && state.session !== "pixel") return;
  const dpr = devicePixelRatio || 1;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const tw = Math.max(1, Math.round(w * dpr));
  const th = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw;
    canvas.height = th;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = (state.session === "draw" && state.page?.infinite) ? "#ffffff" : "#0a0a0a";
  ctx.fillRect(0, 0, w, h);

  const L = applyPage();
  if (L.infinite) {
    const g = 32;
    const x0 = Math.floor(-L.ox / L.s / g) * g - g;
    const y0 = Math.floor(-L.oy / L.s / g) * g - g;
    const x1 = (L.w - L.ox) / L.s + g;
    const y1 = (L.h - L.oy) / L.s + g;
    ctx.fillStyle = "#d4d4d4";
    const dot = Math.max(1.4 / L.s, 0.7);
    for (let x = x0; x <= x1; x += g) {
      for (let y = y0; y <= y1; y += g) {
        ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
      }
    }
  } else {
    ctx.fillStyle = state.session === "pixel" ? "#121212" : "#ffffff";
    ctx.fillRect(0, 0, L.dw, L.dh);
    ctx.strokeStyle = state.session === "pixel" ? "rgba(198,165,58,0.35)" : "#d8d8d8";
    ctx.lineWidth = 1 / L.s;
    ctx.strokeRect(0, 0, L.dw, L.dh);
  }

  if (state.session === "pixel") {
    const n = state.pixelN;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelSheet(), 0, 0, n, n);
    if (state.grid) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 1 / L.s;
      for (let i = 0; i <= n; i++) {
        ctx.moveTo(i, 0); ctx.lineTo(i, n);
        ctx.moveTo(0, i); ctx.lineTo(n, i);
      }
      ctx.stroke();
    }
  } else {
    if (state.grid) {
      const g = 32;
      ctx.beginPath();
      ctx.strokeStyle = "#ececec";
      ctx.lineWidth = 1 / L.s;
      ctx.setLineDash([]);
      if (L.infinite) {
        const x0 = Math.floor(-L.ox / L.s / g) * g;
        const y0 = Math.floor(-L.oy / L.s / g) * g;
        const x1 = (L.w - L.ox) / L.s;
        const y1 = (L.h - L.oy) / L.s;
        for (let x = x0; x <= x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
        for (let y = y0; y <= y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      } else {
        for (let x = 0; x <= L.dw; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, L.dh); }
        for (let y = 0; y <= L.dh; y += g) { ctx.moveTo(0, y); ctx.lineTo(L.dw, y); }
      }
      ctx.stroke();
    }
    const layerMap = new Map(state.layers.map((l) => [l.id, l]));
    const fallback = state.layers[0]?.id;
    state.shapes.forEach((s) => {
      const layer = layerMap.get(s.layerId ?? fallback);
      if (layer && !layer.visible) return;
      ctx.save();
      ctx.globalAlpha = layer?.opacity ?? 1;
      paintShape(s);
      ctx.restore();
    });
    const ids = selIds();
    ids.forEach((id, n) => {
      const s = state.shapes[id];
      if (!s) return;
      const b = bounds(s);
      const Lh = layout();
      ctx.save();
      ctx.setLineDash([5 / Lh.s, 4 / Lh.s]);
      ctx.strokeStyle = n === ids.length - 1 ? "#c6a53a" : "rgba(198,165,58,0.45)";
      ctx.lineWidth = 1.2 / Lh.s;
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.restore();
    });
    const pid = primaryId();
    if (pid != null && state.shapes[pid]) {
      const s = state.shapes[pid];
      const b = bounds(s);
      const c = centerOf(s);
      const hs = handlePts(s);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(s.rot || 0);
      ctx.translate(-c.x, -c.y);
      ctx.setLineDash([5 / L.s, 4 / L.s]);
      ctx.strokeStyle = "#c6a53a";
      ctx.lineWidth = 1.2 / L.s;
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.restore();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(rotPt(b.x + b.w / 2, b.y, s).x, rotPt(b.x + b.w / 2, b.y, s).y);
      ctx.lineTo(hs.rot.x, hs.rot.y);
      ctx.strokeStyle = "#c6a53a";
      ctx.lineWidth = 1.2 / L.s;
      ctx.stroke();
      const sz = 7 / L.s;
      ctx.fillStyle = "#c6a53a";
      [hs.nw, hs.ne, hs.sw, hs.se].forEach((pt) => ctx.fillRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz));
      ctx.beginPath();
      ctx.arc(hs.rot.x, hs.rot.y, 6 / L.s, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
      if (s.type === "curve" && s.pts) {
        ctx.setLineDash([4 / L.s, 4 / L.s]);
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        s.pts.forEach((pt, i) => i && ctx.lineTo(pt.x, pt.y));
        ctx.strokeStyle = "rgba(198,165,58,0.7)";
        ctx.stroke();
        ctx.setLineDash([]);
        s.pts.forEach((pt, i) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (i === 1 || i === 2 && s.pts.length > 3 ? 8 : 6) / L.s, 0, Math.PI * 2);
          ctx.fillStyle = i === 0 || i === s.pts.length - 1 ? "#fff" : "#c6a53a";
          ctx.fill();
          ctx.strokeStyle = "#c6a53a";
          ctx.stroke();
        });
      }
      if (s.type === "zigzag") {
        const a = { x: s.x, y: s.y }, b = { x: s.x + s.w, y: s.y + s.h };
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const amp = s.amp ?? len * 0.12;
        const px = -(b.y - a.y) / len, py = (b.x - a.x) / len;
        const mid = { x: (a.x + b.x) / 2 + px * amp, y: (a.y + b.y) / 2 + py * amp };
        ctx.beginPath();
        ctx.arc(mid.x, mid.y, 8 / L.s, 0, Math.PI * 2);
        ctx.fillStyle = "#c6a53a";
        ctx.fill();
      }
    }
    if (state.polyPts.length) {
      ctx.beginPath();
      ctx.strokeStyle = "#c6a53a";
      ctx.setLineDash([5 / L.s, 4 / L.s]);
      ctx.moveTo(state.polyPts[0].x, state.polyPts[0].y);
      state.polyPts.forEach((p, i) => i && ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  $("#zoom-read").textContent = `${Math.round(state.zoom * 100)}%`;
}

function newShape(type, a, b) {
  return {
    type, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y,
    stroke: state.stroke,
    fill: ["line", "zigzag", "polyline", "curve", "free", "pencil", "brush", "arrow", "arc"].includes(type) ? "#00000000" : state.fill,
    width: type === "brush" ? Math.max(state.width, 6) : type === "pencil" ? 1 : state.width,
    dash: state.dash, sides: state.sides,
    rot: 0,
    layerId: activeLayerId(),
  };
}

function pxAt(p) {
  const n = state.pixelN;
  const x = Math.floor(p.rawX), y = Math.floor(p.rawY);
  if (x < 0 || y < 0 || x >= n || y >= n) return null;
  return { x, y, i: y * n + x };
}

function setPx(i, color) { state.pixels[i] = color; markPixelDirty(); }

function flood(x, y, target, repl) {
  const n = state.pixelN;
  if (target === repl) return;
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop();
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
    const i = cy * n + cx;
    if (state.pixels[i] !== target) continue;
    state.pixels[i] = repl;
    q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  markPixelDirty();
}

function paintPixelStroke(a, b, color) {
  let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const n = state.pixelN;
  while (true) {
    if (x0 >= 0 && y0 >= 0 && x0 < n && y0 < n) setPx(y0 * n + x0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function fillCanvas(hex) {
  const L = layout();
  const w = L.infinite ? Math.max(L.w / L.s, 64) : (state.page.w || DRAW_W);
  const h = L.infinite ? Math.max(L.h / L.s, 64) : (state.page.h || DRAW_H);
  const x = L.infinite ? -L.ox / L.s : 0;
  const y = L.infinite ? -L.oy / L.s : 0;
  const bg = {
    type: "rect",
    x, y, w, h,
    fill: hex, stroke: "#00000000", width: 0, dash: "solid", rot: 0,
    layerId: activeLayerId(),
  };
  const idx = state.shapes.findIndex((s) => (s.layerId ?? activeLayerId()) === activeLayerId());
  if (idx < 0) state.shapes.push(bg);
  else state.shapes.splice(idx, 0, bg);
  pushHist();
  draw();
}

export function onDown(e) {
  if (!state.session || state.picking) return;
  if (state.session === "model") {
    hooks.scene?.pointerDown(e);
    hooks.syncPanel();
    return;
  }
  const p = world(e);
  if (state.session === "pixel") {
    if (state.tool === "select") {
      state.drag = { kind: "pan", mx: e.clientX, my: e.clientY, px: state.pan.x, py: state.pan.y };
      wrap.style.cursor = "grabbing";
      return;
    }
    const cell = pxAt(p);
    if (!cell) return;
    if (state.tool === "fill") {
      flood(cell.x, cell.y, state.pixels[cell.i], state.stroke);
      pushPixel();
      draw();
      return;
    }
    const color = state.tool === "eraser" ? null : state.stroke;
    state.drag = { kind: "pixel", a: cell, color, shape: ["line", "rect", "ellipse"].includes(state.tool) };
    if (!state.drag.shape) { setPx(cell.i, color); draw(); }
    return;
  }
  if (state.tool === "select") {
    const pid = primaryId();
    if (pid != null && state.shapes[pid]) {
      const s = state.shapes[pid];
      const hs = handlePts(s);
      const hitD = 14 / layout().s;
      if (s.type === "curve" && s.pts) {
        for (let i = 0; i < s.pts.length; i++) {
          if (near(s.pts[i], p, Math.max(hitD, 12))) {
            state.drag = { kind: "pt", i, ox: s.pts[i].x, oy: s.pts[i].y, mx: p.rawX, my: p.rawY };
            return;
          }
        }
      }
      if (s.type === "zigzag") {
        const len = Math.hypot(s.w, s.h) || 1;
        const amp = s.amp ?? len * 0.12;
        const px = -s.h / len, py = s.w / len;
        const mid = { x: s.x + s.w / 2 + px * amp, y: s.y + s.h / 2 + py * amp };
        if (near(mid, p, Math.max(hitD, 12))) {
          state.drag = { kind: "amp", len };
          return;
        }
      }
      if (near(hs.rot, p, Math.max(hitD, 10))) {
        const c = centerOf(s);
        state.drag = { kind: "rot", c, start: s.rot || 0, a0: Math.atan2(p.rawY - c.y, p.rawX - c.x) };
        return;
      }
      const corners = [["nw", hs.nw], ["ne", hs.ne], ["sw", hs.sw], ["se", hs.se]];
      for (const [name, pt] of corners) {
        if (near(pt, p, Math.max(hitD, 8))) {
          const b = bounds(s);
          state.drag = { kind: "scale", corner: name, b, rot: s.rot || 0, ox: p.rawX, oy: p.rawY };
          return;
        }
      }
    }
    const i = hit(p);
    if (multiKey(e)) {
      if (i != null) {
        const cur = selIds();
        state.selected = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      }
      draw();
      hooks.syncPanel();
      return;
    }
    if (i == null) {
      state.selected = [];
      state.drag = { kind: "pan", mx: e.clientX, my: e.clientY, px: state.pan.x, py: state.pan.y };
      wrap.style.cursor = "grabbing";
      draw();
      hooks.syncPanel();
      return;
    }
    if (!selIds().includes(i)) state.selected = [i];
    state.drag = {
      kind: "move",
      ox: p.rawX,
      oy: p.rawY,
      items: selIds().map((id) => {
        const s = state.shapes[id];
        return { id, x: s.x, y: s.y, pts: s.pts ? s.pts.map((q) => ({ ...q })) : null };
      }),
    };
    draw();
    hooks.syncPanel();
    return;
  }
  if (state.tool === "fill") {
    const hex = state.fill !== "#00000000" ? state.fill : state.stroke;
    const i = hit(p);
    if (i == null) {
      fillCanvas(hex);
      return;
    }
    const s = state.shapes[i];
    if (s.type === "stamp") fillStamp(s, p.rawX, p.rawY, hex);
    else { s.fill = hex; pushHist(); draw(); }
    return;
  }
  if (state.tool === "eraser") {
    const i = hit(p);
    if (i != null) { state.shapes.splice(i, 1); state.selected = []; pushHist(); draw(); hooks.syncPanel(); }
    return;
  }
  if (state.tool === "polyline") { state.polyPts.push({ x: p.x, y: p.y }); draw(); return; }
  if (state.tool === "text") {
    const i = hit(p);
    if (i != null && state.shapes[i].type === "text") {
      state.selected = [i];
      draw();
      startTextEdit(i);
      return;
    }
    state.drag = { kind: "text", a: p };
    return;
  }
  if (state.tool === "curve") { state.drag = { kind: "curve", a: p }; return; }
  state.drag = { kind: "draw", a: p };
}

function preview(tmp) {
  draw();
  applyPage();
  paintShape(tmp);
}

export function onMove(e) {
  if (!state.session) return;
  if (state.session === "model") { hooks.scene?.pointerMove(e); return; }
  const p = world(e);
  $("#status-pos").textContent = `${Math.round(p.rawX)}, ${Math.round(p.rawY)}`;
  if (!state.drag) return;
  if (state.drag.kind === "pixel") {
    const cell = pxAt(p);
    if (!cell) return;
    if (state.drag.shape) {
      const backup = state.pixels.slice();
      if (state.tool === "line") paintPixelStroke(state.drag.a, cell, state.drag.color);
      else {
        const x0 = Math.min(state.drag.a.x, cell.x), y0 = Math.min(state.drag.a.y, cell.y);
        const x1 = Math.max(state.drag.a.x, cell.x), y1 = Math.max(state.drag.a.y, cell.y);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const onEdge = x === x0 || x === x1 || y === y0 || y === y1;
            const inEl = state.tool !== "ellipse" || (() => {
              const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
              const rx = Math.max((x1 - x0) / 2, 0.5), ry = Math.max((y1 - y0) / 2, 0.5);
              const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
              return v <= 1 && v >= 0.55;
            })();
            if (state.tool === "rect" ? onEdge : inEl) setPx(y * state.pixelN + x, state.drag.color);
          }
        }
      }
      draw();
      for (let i = 0; i < backup.length; i++) state.pixels[i] = backup[i];
      markPixelDirty();
      state.drag.preview = true;
      state.drag.last = cell;
    } else {
      setPx(cell.i, state.drag.color);
      draw();
    }
    return;
  }
  if (state.drag.kind === "pan") {
    state.pan.x = state.drag.px + (e.clientX - state.drag.mx);
    state.pan.y = state.drag.py + (e.clientY - state.drag.my);
    draw();
    return;
  }
  if (state.drag.kind === "pt") {
    const s = state.shapes[primaryId()];
    s.pts[state.drag.i].x = state.drag.ox + (p.rawX - state.drag.mx);
    s.pts[state.drag.i].y = state.drag.oy + (p.rawY - state.drag.my);
    draw();
    return;
  }
  if (state.drag.kind === "amp") {
    const s = state.shapes[primaryId()];
    const len = state.drag.len || Math.hypot(s.w, s.h) || 1;
    const px = -s.h / len, py = s.w / len;
    const mid = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    s.amp = (p.rawX - mid.x) * px + (p.rawY - mid.y) * py;
    draw();
    return;
  }
  if (state.drag.kind === "rot") {
    const s = state.shapes[primaryId()];
    const a = Math.atan2(p.rawY - state.drag.c.y, p.rawX - state.drag.c.x);
    s.rot = state.drag.start + (a - state.drag.a0);
    draw();
    return;
  }
  if (state.drag.kind === "scale") {
    const s = state.shapes[primaryId()];
    const b = state.drag.b;
    const loc = toLocal(p, { ...s, rot: state.drag.rot, x: b.x, y: b.y, w: b.w, h: b.h, pts: null });
    const name = state.drag.corner;
    let x = b.x, y = b.y, w = b.w, h = b.h;
    if (name.includes("n")) { h = (b.y + b.h) - loc.y; y = loc.y; }
    if (name.includes("s")) h = loc.y - b.y;
    if (name.includes("w")) { w = (b.x + b.w) - loc.x; x = loc.x; }
    if (name.includes("e")) w = loc.x - b.x;
    s.x = x; s.y = y; s.w = w; s.h = h;
    if (s.type === "text") s.fontSize = Math.max(8, Math.abs(h) * 0.72);
    draw();
    return;
  }
  if (state.drag.kind === "move") {
    const dx = p.rawX - state.drag.ox, dy = p.rawY - state.drag.oy;
    (state.drag.items || []).forEach((it) => {
      const s = state.shapes[it.id];
      if (!s) return;
      s.x = snap(it.x + dx);
      s.y = snap(it.y + dy);
      if (s.pts && it.pts) s.pts = it.pts.map((q) => ({ x: snap(q.x + dx), y: snap(q.y + dy) }));
    });
    draw();
    return;
  }
  if (state.drag.kind === "text") {
    const a = state.drag.a;
    preview({
      type: "rect", x: a.x, y: a.y, w: p.x - a.x, h: p.y - a.y,
      stroke: state.stroke, fill: "#00000000", width: 1, dash: "dash", rot: 0,
    });
    return;
  }
  if (state.drag.kind === "curve") {
    const a = state.drag.a;
    const mid = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
    preview({
      type: "curve",
      pts: [a, mid, { x: p.x, y: p.y }],
      stroke: state.stroke, fill: "#00000000", width: state.width, dash: state.dash,
    });
    return;
  }
  if (["free", "pencil", "brush"].includes(state.tool)) {
    if (!state.drag.pts) state.drag.pts = [{ x: state.drag.a.x, y: state.drag.a.y }];
    state.drag.pts.push({ x: p.x, y: p.y });
    const tmp = newShape(state.tool, state.drag.a, p);
    tmp.pts = state.drag.pts;
    preview(tmp);
    return;
  }
  const tmp = newShape(state.tool === "compass" ? "compass" : state.tool, state.drag.a, p);
  if (state.tool === "compass") {
    const r = Math.hypot(p.x - state.drag.a.x, p.y - state.drag.a.y);
    tmp.x = state.drag.a.x - r; tmp.y = state.drag.a.y - r; tmp.w = r * 2; tmp.h = r * 2;
  }
  preview(tmp);
}

export function onUp(e) {
  if (state.session === "model") { hooks.scene?.pointerUp(e); return; }
  if (!state.drag) return;
  const p = world(e);
  if (state.drag.kind === "pixel") {
    if (state.drag.shape && state.drag.last) {
      const cell = state.drag.last;
      if (state.tool === "line") paintPixelStroke(state.drag.a, cell, state.drag.color);
      else {
        const x0 = Math.min(state.drag.a.x, cell.x), y0 = Math.min(state.drag.a.y, cell.y);
        const x1 = Math.max(state.drag.a.x, cell.x), y1 = Math.max(state.drag.a.y, cell.y);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const onEdge = x === x0 || x === x1 || y === y0 || y === y1;
            if (state.tool === "rect" && onEdge) setPx(y * state.pixelN + x, state.drag.color);
            if (state.tool === "ellipse") {
              const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
              const rx = Math.max((x1 - x0) / 2, 0.5), ry = Math.max((y1 - y0) / 2, 0.5);
              const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
              if (v <= 1 && v >= 0.55) setPx(y * state.pixelN + x, state.drag.color);
            }
          }
        }
      }
    }
    pushPixel();
    state.drag = null;
    draw();
    return;
  }
  if (state.drag.kind === "pan") {
    wrap.style.cursor = "default";
    state.drag = null;
    return;
  }
  if (state.drag.kind === "move" || state.drag.kind === "rot" || state.drag.kind === "scale" || state.drag.kind === "pt" || state.drag.kind === "amp") {
    pushHist(); state.drag = null; hooks.syncPanel(); return;
  }
  if (state.drag.kind === "text") {
    const a = state.drag.a;
    const w = Math.abs(p.x - a.x), h = Math.abs(p.y - a.y);
    const fontSize = h > 16 ? Math.max(12, Math.round(h * 0.72)) : 28;
    const sh = {
      type: "text",
      x: w > 12 ? Math.min(a.x, p.x) : a.x,
      y: h > 12 ? Math.min(a.y, p.y) : a.y,
      w: w > 12 ? w : 220,
      h: h > 12 ? h : fontSize * 1.4,
      text: "Testo",
      fontSize,
      stroke: state.stroke,
      fill: "#1a1a1a",
      width: 0, dash: "solid", rot: 0,
      layerId: activeLayerId(),
    };
    state.shapes.push(sh);
    state.selected = [state.shapes.length - 1];
    pushHist();
    state.drag = null;
    draw();
    startTextEdit(state.shapes.length - 1);
    hooks.syncPanel();
    return;
  }
  if (state.drag.kind === "curve") {
    const a = state.drag.a;
    const b = { x: p.x, y: p.y };
    const ctrl = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    state.shapes.push({
      type: "curve",
      pts: [a, ctrl, b],
      stroke: state.stroke, fill: "#00000000", width: state.width, dash: state.dash,
      rot: 0, layerId: activeLayerId(),
    });
    state.selected = [state.shapes.length - 1];
    pushHist();
    state.drag = null; draw(); hooks.syncPanel(); return;
  }
  if (["free", "pencil", "brush"].includes(state.tool) && state.drag.pts?.length > 1) {
    const sh = newShape(state.tool, state.drag.a, p); sh.pts = state.drag.pts;
    state.shapes.push(sh); state.selected = [state.shapes.length - 1]; pushHist();
  } else if (state.drag.kind === "draw") {
    const sh = newShape(state.tool === "compass" ? "compass" : state.tool, state.drag.a, p);
    if (state.tool === "compass") {
      const r = Math.hypot(p.x - state.drag.a.x, p.y - state.drag.a.y);
      sh.x = state.drag.a.x - r; sh.y = state.drag.a.y - r; sh.w = r * 2; sh.h = r * 2;
    }
    if (Math.abs(sh.w) > 2 || Math.abs(sh.h) > 2) {
      state.shapes.push(sh); state.selected = [state.shapes.length - 1]; pushHist();
    }
  }
  state.drag = null; draw(); hooks.syncPanel();
}

export function finishPolyline() {
  if (state.polyPts.length < 2) { state.polyPts = []; draw(); return; }
  state.shapes.push({ type: "polyline", pts: state.polyPts.slice(), stroke: state.stroke, fill: "#00000000", width: state.width, dash: state.dash, rot: 0, layerId: activeLayerId() });
  state.selected = [state.shapes.length - 1];
  state.polyPts = [];
  pushHist(); draw(); hooks.syncPanel();
}


export function sel() {
  const i = primaryId();
  return i != null ? state.shapes[i] : null;
}

export async function mergeDraw(op) {
  const ids = selIds();
  if (op === "split") {
    toast("Spezza: solo su unioni recenti con copie interne");
    return false;
  }
  if (ids.length < 2) {
    toast("⌘+clic su almeno due forme");
    return false;
  }
  const kids = ids.map((i) => structuredClone(state.shapes[i]));
  await Promise.all(kids.filter((k) => k.type === "stamp").map(ensureStampImg));
  let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity;
  kids.forEach((k) => {
    const b = bounds(k);
    x = Math.min(x, b.x); y = Math.min(y, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  });
  const pad = 8;
  const w = Math.max(1, Math.ceil(x2 - x + pad * 2));
  const h = Math.max(1, Math.ceil(y2 - y + pad * 2));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.translate(-x + pad, -y + pad);
  const prev = ctx;
  const paintKids = (list) => {
    list.forEach((sh) => {
      const layerA = 1;
      g.save();
      g.globalAlpha = layerA;
      if (sh.type === "stamp") {
        const im = stampImgs.get(sh.stampId);
        if (im?.complete && im.naturalWidth) g.drawImage(im, sh.x, sh.y, sh.w, sh.h);
      } else if (sh.type === "text") {
        paintText(sh, g);
      } else {
        const cen = centerOf(sh);
        g.save();
        g.translate(cen.x, cen.y);
        g.rotate(sh.rot || 0);
        g.translate(-cen.x, -cen.y);
        g.strokeStyle = sh.stroke;
        g.fillStyle = sh.fill && sh.fill !== "#00000000" ? sh.fill : "transparent";
        g.lineWidth = sh.width || 2;
        g.beginPath();
        pathShape(sh, g);
        if (sh.fill && sh.fill !== "#00000000") g.fill();
        g.stroke();
        g.restore();
      }
      g.restore();
    });
  };
  paintKids([kids[0]]);
  if (op === "union") paintKids(kids.slice(1));
  else if (op === "sub") {
    g.globalCompositeOperation = "destination-out";
    paintKids(kids.slice(1).map((k) => ({ ...k, fill: k.fill === "#00000000" ? "#111" : k.fill })));
  } else if (op === "inter") {
    g.globalCompositeOperation = "destination-in";
    paintKids(kids.slice(1));
  }
  void prev;
  const stamp = {
    type: "stamp",
    x: x - pad, y: y - pad, w, h,
    stampId: internStamp(c.toDataURL()),
    stroke: "#00000000", fill: "#00000000", width: 0, dash: "solid", rot: 0,
    layerId: kids[0].layerId ?? activeLayerId(),
  };
  [...ids].sort((a, b) => b - a).forEach((i) => state.shapes.splice(i, 1));
  state.shapes.push(stamp);
  state.selected = [state.shapes.length - 1];
  pushHist();
  draw();
  return true;
}

export async function exportDrawPng() {
  await Promise.all(state.shapes.filter((s) => s.type === "stamp").map(ensureStampImg));
  let x = 0, y = 0, w = state.page.w || DRAW_W, h = state.page.h || DRAW_H;
  if (state.page?.infinite) {
    const b = contentBounds();
    const pad = 48;
    x = b.x - pad; y = b.y - pad;
    w = Math.max(64, Math.ceil(b.w + pad * 2));
    h = Math.max(64, Math.ceil(b.h + pad * 2));
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);
  g.translate(-x, -y);
  for (const s of state.shapes) {
    const layer = state.layers.find((l) => l.id === (s.layerId ?? state.layers[0]?.id));
    if (layer && !layer.visible) continue;
    g.save();
    g.globalAlpha = layer?.opacity ?? 1;
    paintShape(s, g, 1);
    g.restore();
  }
  const a = document.createElement("a");
  a.download = state.page?.infinite ? "tela-infinita.png" : `tela-${w}x${h}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}

export function exportPixelPng() {
  const n = state.pixelN;
  const c = document.createElement("canvas");
  c.width = n; c.height = n;
  const g = c.getContext("2d");
  for (const layer of state.pixelLayers) {
    if (!layer.visible) continue;
    g.save();
    g.globalAlpha = layer.opacity ?? 1;
    for (let i = 0; i < n * n; i++) {
      const col = layer.pixels[i];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(i % n, Math.floor(i / n), 1, 1);
    }
    g.restore();
  }
  const a = document.createElement("a");
  a.download = `sprite-${n}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}

export function clearDraw() {
  state.shapes = [];
  state.selected = [];
  state.polyPts = [];
  state.history = [[]];
  state.histI = 0;
  pruneStamps(new Set());
}

export function clearPixel() {
  for (const l of state.pixelLayers) l.pixels.fill(null);
  state.pixelHist = [state.pixelLayers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity ?? 1, pixels: l.pixels.slice() }))];
  state.pixelHistI = 0;
  markPixelDirty();
}

export function contentBounds() {
  if (!state.shapes.length) return { x: -400, y: -300, w: 800, h: 600 };
  let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const s of state.shapes) {
    const b = bounds(s);
    x = Math.min(x, b.x); y = Math.min(y, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

export function zoomFitDraw() {
  const L0 = layout();
  if (!state.page?.infinite) {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    draw();
    return;
  }
  const b = contentBounds();
  const pad = 64;
  const s = Math.min(8, Math.max(0.05, Math.min((L0.w - pad * 2) / b.w, (L0.h - pad * 2) / b.h)));
  state.zoom = s;
  state.pan.x = -(b.x + b.w / 2) * s;
  state.pan.y = -(b.y + b.h / 2) * s;
  draw();
}

export function canvasThumb() {
  try {
    if (state.session === "model") {
      const c = document.querySelector("#view3d canvas");
      if (!c) return "";
      const t = document.createElement("canvas");
      t.width = 200; t.height = 120;
      t.getContext("2d").drawImage(c, 0, 0, 200, 120);
      return t.toDataURL("image/jpeg", 0.55);
    }
    if (!canvas.width) return "";
    const t = document.createElement("canvas");
    t.width = 200; t.height = 120;
    t.getContext("2d").drawImage(canvas, 0, 0, 200, 120);
    return t.toDataURL("image/jpeg", 0.55);
  } catch {
    return "";
  }
}

function textEditEl() {
  let el = $("#text-edit");
  if (!el) {
    el = document.createElement("textarea");
    el.id = "text-edit";
    el.hidden = true;
    wrap.appendChild(el);
  }
  return el;
}

let editingI = -1;

export function endTextEdit() {
  const el = $("#text-edit");
  if (!el || el.hidden) return;
  const s = state.shapes[editingI];
  if (s?.type === "text") {
    s.text = el.value;
    const size = s.fontSize || 28;
    s.h = Math.max(size * 1.3, (el.value.split("\n").length) * size * 1.25);
  }
  el.hidden = true;
  editingI = -1;
  pushHist();
  draw();
  hooks.syncPanel();
}

export function startTextEdit(i) {
  const s = state.shapes[i];
  if (!s || s.type !== "text") return;
  endTextEdit();
  editingI = i;
  const el = textEditEl();
  const L = layout();
  el.hidden = false;
  el.value = s.text || "";
  el.style.left = `${L.ox + s.x * L.s}px`;
  el.style.top = `${L.oy + s.y * L.s}px`;
  el.style.width = `${Math.max(80, s.w) * L.s}px`;
  el.style.height = `${Math.max(s.fontSize || 28, s.h) * L.s}px`;
  el.style.fontSize = `${(s.fontSize || 28) * L.s}px`;
  el.style.color = s.fill && s.fill !== "#00000000" ? s.fill : (s.stroke || "#c6a53a");
  el.focus();
  el.select();
  el.onblur = () => endTextEdit();
}

export function addImageAt(file, clientX, clientY) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const src = reader.result;
    const im = new Image();
    im.onload = () => {
      const p = world({ clientX, clientY });
      const max = 480;
      let w = im.naturalWidth, h = im.naturalHeight;
      if (w > max || h > max) {
        const f = max / Math.max(w, h);
        w *= f; h *= f;
      }
      state.shapes.push({
        type: "stamp",
        x: p.x - w / 2, y: p.y - h / 2, w, h,
        stampId: internStamp(src),
        stroke: "#00000000", fill: "#00000000", width: 0, dash: "solid", rot: 0,
        layerId: activeLayerId(),
      });
      state.selected = [state.shapes.length - 1];
      pushHist();
      draw();
      hooks.syncPanel();
      toast("Immagine inserita");
    };
    im.src = src;
  };
  reader.readAsDataURL(file);
}

