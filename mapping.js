// mapping.js
export function regimeToActivityType(txt = "") {
  const t = txt.normalize("NFKC").toLowerCase();
  if (t.includes("agirc") || t.includes("arrco")) return "private";
  if (t.includes("rci")) return "liberal";
  if (t.includes("msa")) return "msa";
  return "private";
}
export function parseAmount(eur) {
  if (!eur) return undefined;
  return Number(String(eur).replace(/[ € ]/g,"").replace(/\./g,"").replace(",", "."));
}
export function toFloat(fr) { return Number(String(fr).replace(",", ".")); }
