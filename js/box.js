const KEY = "dram-box-v1";

export function listBox() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export function getBox(id) {
  return listBox().find((r) => r.id === id) || null;
}

export function upsertBox(entry) {
  const rows = listBox();
  const i = rows.findIndex((r) => r.id === entry.id);
  const row = {
    id: entry.id,
    name: entry.name || "Foglio",
    session: entry.session,
    updated: Date.now(),
    thumb: entry.thumb || (i >= 0 ? rows[i].thumb : ""),
    page: entry.page || null,
    data: entry.data,
  };
  if (i >= 0) rows[i] = { ...rows[i], ...row };
  else rows.unshift(row);
  rows.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  try {
    writeAll(rows);
  } catch {
    throw new Error("Box pieno: togli un foglio o salva come file");
  }
  return row;
}

export function deleteBox(id) {
  writeAll(listBox().filter((r) => r.id !== id));
}

export function renameBox(id, name) {
  const rows = listBox();
  const r = rows.find((x) => x.id === id);
  if (!r) return;
  r.name = name;
  r.updated = Date.now();
  writeAll(rows);
}

export function sessionLabel(sess) {
  if (sess === "pixel") return "Pixel";
  if (sess === "model") return "3D";
  return "Disegno";
}

export function pageLabel(page, sess) {
  if (sess === "pixel") return "";
  if (sess === "model") return "";
  if (page?.infinite) return "Infinito";
  if (page?.w && page?.h) return `${page.w} × ${page.h}`;
  return "";
}
