export const MAX_HIST = 40;

export function capHist(list, index) {
  if (list.length <= MAX_HIST) return { list, index };
  const drop = list.length - MAX_HIST;
  return { list: list.slice(drop), index: Math.max(0, index - drop) };
}
