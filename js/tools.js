export const ICONS = {
  select: `<svg viewBox="0 0 24 24"><path d="M5 4l6 16 2-7 7-2z"/></svg>`,
  line: `<svg viewBox="0 0 24 24"><path d="M5 19L19 5"/></svg>`,
  zigzag: `<svg viewBox="0 0 24 24"><path d="M4 18l4-8 4 8 4-8 4 8"/></svg>`,
  polyline: `<svg viewBox="0 0 24 24"><path d="M4 18l5-8 6 4 6-10"/></svg>`,
  curve: `<svg viewBox="0 0 24 24"><path d="M4 18c4-12 12 0 16-12"/></svg>`,
  free: `<svg viewBox="0 0 24 24"><path d="M4 16c2-6 4 2 7-2s3-8 9-8"/></svg>`,
  compass: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/></svg>`,
  arc: `<svg viewBox="0 0 24 24"><path d="M5 16a8 8 0 0 1 14-2"/></svg>`,
  rect: `<svg viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="12" rx="1"/></svg>`,
  round: `<svg viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="12" rx="4"/></svg>`,
  ellipse: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>`,
  triangle: `<svg viewBox="0 0 24 24"><path d="M12 5l8 14H4z"/></svg>`,
  poly: `<svg viewBox="0 0 24 24"><path d="M12 3l8 6v8l-8 4-8-4V9z"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 3l2.4 7h7.1l-5.8 4.2 2.3 7.1L12 17.4 6 21.3l2.3-7.1L2.5 10h7.1z"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24"><path d="M4 12h13M13 6l6 6-6 6"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>`,
  brush: `<svg viewBox="0 0 24 24"><path d="M6 20c2 0 3-2 3-4H7c-2 2-2 4-1 4zM9 15l8-9 3 3-9 8z"/></svg>`,
  fill: `<svg viewBox="0 0 24 24"><path d="M5 14l7-8 7 8v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/></svg>`,
  eraser: `<svg viewBox="0 0 24 24"><path d="M5 15l7-7 6 6-4 4H8z"/><path d="M8 19h12"/></svg>`,
  box: `<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>`,
  sphere: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3"/></svg>`,
  cylinder: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="6" ry="2.5"/><path d="M6 6v12c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6"/></svg>`,
  cone: `<svg viewBox="0 0 24 24"><path d="M12 4l8 16H4z"/></svg>`,
  move: `<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M21 12l-3-3M21 12l-3 3"/></svg>`,
  rotate: `<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v5h5"/></svg>`,
  scale: `<svg viewBox="0 0 24 24"><path d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7"/></svg>`,
  face: `<svg viewBox="0 0 24 24"><path d="M5 7h14v10H5z"/><path d="M5 7l7-3 7 3"/></svg>`,
  vertex: `<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="12" cy="6" r="2"/><path d="M6 18L12 6l6 12"/></svg>`,
  text: `<svg viewBox="0 0 24 24"><path d="M5 6h14M12 6v13M8 19h8"/></svg>`,
};

export const DRAW_TOOLS = [
  { group: "Sel", items: [{ id: "select", name: "Selezione" }] },
  { group: "Linee", items: [
    { id: "line", name: "Dritta" },
    { id: "zigzag", name: "Zigzag" },
    { id: "curve", name: "Curva" },
    { id: "free", name: "A mano" },
    { id: "compass", name: "Compasso" },
    { id: "arc", name: "Arco" },
  ]},
  { group: "Forme", items: [
    { id: "rect", name: "Rettangolo" }, { id: "round", name: "Arrotondato" },
    { id: "ellipse", name: "Ellisse" }, { id: "triangle", name: "Triangolo" },
    { id: "poly", name: "Poligono" }, { id: "star", name: "Stella" },
    { id: "arrow", name: "Freccia" },
  ]},
  { group: "Pennelli", items: [
    { id: "pencil", name: "Matita" }, { id: "brush", name: "Pennello" },
    { id: "fill", name: "Riempimento" }, { id: "eraser", name: "Gomma" },
    { id: "text", name: "Testo" },
  ]},
];

export const PIXEL_TOOLS = [
  { group: "Sel", items: [{ id: "select", name: "Selezione" }] },
  { group: "Pixel", items: [
    { id: "pencil", name: "Matita" }, { id: "fill", name: "Secchiello" },
    { id: "eraser", name: "Gomma" }, { id: "line", name: "Linea" },
    { id: "rect", name: "Rettangolo" }, { id: "ellipse", name: "Ellisse" },
  ]},
];

export const MODEL_TOOLS = [
  { group: "Sel", items: [{ id: "select", name: "Selezione" }] },
  { group: "Assi", items: [
    { id: "move", name: "Sposta" }, { id: "rotate", name: "Ruota" }, { id: "scale", name: "Allunga" },
  ]},
  { group: "Modifica", items: [
    { id: "face", name: "Faccia" }, { id: "vertex", name: "Angoli" },
  ]},
  { group: "Solidi", items: [
    { id: "box", name: "Cubo" }, { id: "sphere", name: "Sfera" },
    { id: "cylinder", name: "Cilindro" }, { id: "cone", name: "Cono" },
  ]},
];

export function toolsFor(session) {
  if (session === "pixel") return PIXEL_TOOLS;
  if (session === "model") return MODEL_TOOLS;
  return DRAW_TOOLS;
}
