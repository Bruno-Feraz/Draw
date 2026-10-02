let seq = 1;
const blobs = new Map();
export const stampImgs = new Map();

export function stampSrc(s) {
  if (!s) return "";
  if (s.stampId != null && blobs.has(s.stampId)) return blobs.get(s.stampId);
  return s.src || "";
}

export function internStamp(src) {
  if (!src) return null;
  for (const [id, v] of blobs) if (v === src) return id;
  const id = seq++;
  blobs.set(id, src);
  return id;
}

export function exportStamps() {
  return Object.fromEntries(blobs);
}

export function importStamps(obj) {
  blobs.clear();
  stampImgs.clear();
  seq = 1;
  if (!obj) return;
  for (const [k, v] of Object.entries(obj)) {
    const id = +k;
    if (!v) continue;
    blobs.set(id, v);
    if (id >= seq) seq = id + 1;
  }
}

export function hydrateShapes(shapes) {
  for (const s of shapes || []) {
    if (s.type !== "stamp") continue;
    if (s.src) {
      s.stampId = internStamp(s.src);
      delete s.src;
    }
  }
}

export function slimShapes(shapes) {
  return (shapes || []).map((s) => {
    const n = structuredClone(s);
    if (n.type === "stamp") delete n.src;
    return n;
  });
}

export function usedStampIds(lists) {
  const ids = new Set();
  for (const list of lists) {
    for (const s of list || []) {
      if (s?.stampId != null) ids.add(s.stampId);
    }
  }
  return ids;
}

export function pruneStamps(keep) {
  for (const id of [...blobs.keys()]) {
    if (!keep.has(id)) {
      blobs.delete(id);
      stampImgs.delete(id);
    }
  }
}

export function ensureStampImg(s) {
  const src = stampSrc(s);
  if (!src) return Promise.resolve(null);
  const cached = stampImgs.get(s.stampId);
  if (cached?.complete && cached.naturalWidth) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      stampImgs.set(s.stampId, im);
      resolve(im);
    };
    im.onerror = () => resolve(null);
    im.src = src;
  });
}
