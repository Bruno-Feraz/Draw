/** Tasto per aggiungere alla selezione: ⌘ su Mac, Ctrl altrove. */
export function multiKey(e) {
  return e.metaKey || e.ctrlKey;
}

export function cmdKey(e) {
  return e.metaKey || e.ctrlKey;
}
