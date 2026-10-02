export const DRAW_W = 1920;
export const DRAW_H = 1080;

export const DRAW_SIZES = [
  { id: "infinite", name: "Infinito", meta: "Come Excalidraw", size: "Senza bordo", infinite: true, w: 1920, h: 1080 },
  { id: "hd", name: "HD", meta: "Tela video", size: "1920 × 1080", w: 1920, h: 1080 },
  { id: "square", name: "Quadrato", meta: "Icona, post", size: "1080 × 1080", w: 1080, h: 1080 },
  { id: "hd720", name: "HD 720", meta: "Tela compatta", size: "1280 × 720", w: 1280, h: 720 },
  { id: "a4", name: "A4", meta: "Stampa verticale", size: "1240 × 1754", w: 1240, h: 1754 },
];

export function defaultPage() {
  return { w: DRAW_W, h: DRAW_H, infinite: false };
}

export const state = {
  session: null,
  picking: false,
  tool: "select",
  docId: null,
  docName: "Foglio",
  sideView: "fn",
  grid: false,
  snap: false,
  zoom: 1,
  pan: { x: 0, y: 0 },
  stroke: "#c6a53a",
  fill: "#00000000",
  width: 2,
  dash: "solid",
  sides: 6,
  shapes: [],
  selected: [],
  drag: null,
  polyPts: [],
  history: [[]],
  histI: 0,
  panel: true,
  page: defaultPage(),
  pixelN: 32,
  pixels: null,
  pixelHist: [],
  pixelHistI: -1,
  layers: [],
  pixelLayers: [],
  drawLayer: 1,
  pixelLayer: 1,
  layerSeq: 1,
};

export function activeLayerId() {
  return state.session === "pixel" ? state.pixelLayer : state.drawLayer;
}

export function setActiveLayerId(id) {
  if (state.session === "pixel") state.pixelLayer = id;
  else state.drawLayer = id;
}

export function makeLayer(name) {
  return { id: state.layerSeq++, name, visible: true, opacity: 1 };
}

export function ensureDrawLayers() {
  if (!state.layers.length) {
    const l = makeLayer("Livello 1");
    state.layers = [l];
    state.drawLayer = l.id;
  } else if (!state.layers.some((l) => l.id === state.drawLayer)) {
    state.drawLayer = state.layers[state.layers.length - 1].id;
  }
}

export function ensurePixelLayers(n) {
  if (!state.pixelLayers.length) {
    const l = makeLayer("Livello 1");
    l.pixels = new Array(n * n).fill(null);
    state.pixelLayers = [l];
    state.pixelLayer = l.id;
  } else if (!state.pixelLayers.some((l) => l.id === state.pixelLayer)) {
    state.pixelLayer = state.pixelLayers[state.pixelLayers.length - 1].id;
  }
  const cur = state.pixelLayers.find((x) => x.id === state.pixelLayer);
  state.pixels = cur?.pixels ?? state.pixelLayers[0].pixels;
}
